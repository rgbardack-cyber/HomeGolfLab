import { useCallback, useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { useStore } from '@/store';
import { clearAllMedia } from '@/lib/media/cleanup';
import { effectiveCap, formatBytes } from '@/lib/media/policy';
import { getMediaStore } from '@/lib/media/store';
import { Button, Card, Notice } from '@/components/ui';

interface Info { bytes: number; videos: number; cap: number; persistent: boolean }

/** "Espacio usado" (Perfil): cuánto ocupan los videos guardados y un botón para borrarlos. Solo con las funciones de video encendidas. */
export default function StorageCard() {
  const clearMediaRefs = useStore((s) => s.clearMediaRefs);
  const [info, setInfo] = useState<Info | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const st = await getMediaStore();
      const [u, refs, est] = await Promise.all([st.usage(), st.listRefs(), navigator.storage?.estimate?.().catch(() => undefined)]);
      setInfo({ bytes: u.bytes, videos: refs.length, cap: effectiveCap({ quotaBytes: est?.quota }), persistent: st.persistent });
      setError(null);
    } catch { setError('No se pudo leer el espacio usado en este dispositivo.'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const wipe = async () => {
    try {
      await clearAllMedia(await getMediaStore());
      clearMediaRefs();
      setConfirm(false);
      await refresh();
    } catch { setError('No se pudieron borrar los videos. Inténtalo de nuevo.'); }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <HardDrive className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-lg font-semibold">Espacio usado</h2>
      </div>
      {info ? (
        <p className="text-sm">
          <span className="font-semibold">{info.videos} {info.videos === 1 ? 'video guardado' : 'videos guardados'}</span> · {formatBytes(info.bytes)} de {formatBytes(info.cap)} permitidos
        </p>
      ) : <p className="text-sm text-muted-foreground">Calculando…</p>}
      {info && !info.persistent && (
        <Notice>En este navegador los videos no se conservan al cerrar la pestaña (por ejemplo en modo privado). Se guardan de forma permanente en la app instalada.</Notice>
      )}
      {info && info.bytes > info.cap && <Notice tone="error">Los videos guardados pasan del límite. Borra algunos para poder guardar nuevos.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-xs text-muted-foreground">Los videos nunca salen de tu dispositivo. Las exportaciones y grabaciones temporales se borran solas a las 24 h.</p>
      {confirm ? (
        <div className="flex gap-2">
          <Button variant="outline" full onClick={() => setConfirm(false)}>Cancelar</Button>
          <Button full className="!bg-destructive" onClick={wipe}>Sí, borrar los videos</Button>
        </div>
      ) : (
        <Button variant="outline" disabled={!info || info.bytes === 0} onClick={() => setConfirm(true)}>Borrar videos guardados</Button>
      )}
    </Card>
  );
}
