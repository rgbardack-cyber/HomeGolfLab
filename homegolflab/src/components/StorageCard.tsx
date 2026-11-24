import { useCallback, useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { useStore } from '@/store';
import { clearAllMedia } from '@/lib/media/cleanup';
import { effectiveCap, formatBytes } from '@/lib/media/policy';
import { getMediaStore } from '@/lib/media/store';
import { Button, Card, Notice } from '@/components/ui';
import { t, useT } from '@/i18n';

interface Info { bytes: number; videos: number; cap: number; persistent: boolean }

/** "Espacio usado" (Perfil): cuánto ocupan los videos guardados y un botón para borrarlos. Solo con las funciones de video encendidas. */
export default function StorageCard() {
  useT();
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
    } catch { setError(t('storage.readError')); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const wipe = async () => {
    try {
      await clearAllMedia(await getMediaStore());
      clearMediaRefs();
      setConfirm(false);
      await refresh();
    } catch { setError(t('storage.wipeError')); }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <HardDrive className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-lg font-semibold">{t('storage.title')}</h2>
      </div>
      {info ? (
        <p className="text-sm">
          <span className="font-semibold">{info.videos} {info.videos === 1 ? t('storage.videoOne') : t('storage.videoMany')}</span> · {t('storage.ofAllowed', { used: formatBytes(info.bytes), cap: formatBytes(info.cap) })}
        </p>
      ) : <p className="text-sm text-muted-foreground">{t('storage.calculating')}</p>}
      {info && !info.persistent && (
        <Notice>{t('storage.notPersistent')}</Notice>
      )}
      {info && info.bytes > info.cap && <Notice tone="error">{t('storage.overLimit')}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <p className="text-xs text-muted-foreground">{t('storage.note')}</p>
      {confirm ? (
        <div className="flex gap-2">
          <Button variant="outline" full onClick={() => setConfirm(false)}>{t('perfil.cancel')}</Button>
          <Button full className="!bg-destructive" onClick={wipe}>{t('storage.confirm')}</Button>
        </div>
      ) : (
        <Button variant="outline" disabled={!info || info.bytes === 0} onClick={() => setConfirm(true)}>{t('storage.wipe')}</Button>
      )}
    </Card>
  );
}
