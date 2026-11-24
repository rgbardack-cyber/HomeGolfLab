import { Button, Notice } from '@/components/ui';
import { useStore } from '@/store';

/**
 * Interruptor de Premium de prueba. SOLO para pruebas internas: se dibuja unicamente con `INTERNAL` (desarrollo o VITE_INTERNAL=1),
 * asi que el build publico no lo trae ni su texto (el texto esta aqui, no en los diccionarios). Excluido de la traduccion a proposito,
 * igual que FlagsPanel (ver literals.test.ts).
 */
export default function PremiumTestSwitch() {
  const { profile, setProfile } = useStore();
  return (
    <>
      <Notice>
        Los pagos todavía no están conectados. Este interruptor es solo para probar la app: en la versión de tiendas se reemplaza por la compra dentro de App Store y Google Play.
      </Notice>
      <Button full variant={profile.premium ? 'outline' : 'gold'} onClick={() => setProfile({ premium: !profile.premium })}>
        {profile.premium ? 'Volver al plan gratuito (prueba)' : 'Activar Premium (modo prueba)'}
      </Button>
    </>
  );
}
