import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, Link2, Share2, Check, Copy, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';

export default function InviteCard({ user }) {
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${window.location.origin}/register?ref=${encodeURIComponent(user?.email || '')}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareLink = async () => {
    if (navigator.share) {
      await navigator.share({
        title: '¡Únete a HomeGolf LAB!',
        text: `${user?.full_name || 'Un amigo'} te invita a entrenar golf juntos en HomeGolf LAB 🏌️`,
        url: inviteUrl,
      });
    } else {
      copyLink();
    }
  };

  return (
    <>
      <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl border border-primary/20 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-heading font-semibold text-sm">Invita a un amigo</p>
            <p className="text-xs text-muted-foreground">Comparte tu link o muestra el QR en persona</p>
          </div>
        </div>

        {/* Invite URL display */}
        <div className="flex items-center gap-2 bg-background rounded-xl border border-border px-3 py-2">
          <p className="flex-1 text-xs text-muted-foreground truncate">{inviteUrl}</p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" size="sm" onClick={copyLink} className="flex flex-col h-auto py-2.5 gap-1 text-xs">
            {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            {copied ? '¡Copiado!' : 'Copiar'}
          </Button>
          <Button variant="outline" size="sm" onClick={shareLink} className="flex flex-col h-auto py-2.5 gap-1 text-xs">
            <Share2 className="w-4 h-4" />
            Compartir
          </Button>
          <Button
            size="sm"
            onClick={() => setShowQR(true)}
            className="flex flex-col h-auto py-2.5 gap-1 text-xs bg-primary"
          >
            <QrCode className="w-4 h-4" />
            QR
          </Button>
        </div>

        {/* WhatsApp quick share */}
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`¡Entrena golf conmigo en HomeGolf LAB! 🏌️ Regístrate aquí: ${inviteUrl}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#25D366] text-white text-sm font-medium hover:bg-[#1ebe5d] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Invitar por WhatsApp
        </a>
      </div>

      {/* QR Modal */}
      <AnimatePresence>
        {showQR && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={() => setShowQR(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="bg-card rounded-2xl border border-border p-6 w-full max-w-xs space-y-4 text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-semibold">Escanea para agregarme</h3>
                <button onClick={() => setShowQR(false)} className="p-1.5 rounded-lg hover:bg-muted">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex justify-center p-4 bg-white rounded-2xl">
                <QRCodeSVG
                  value={inviteUrl}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#1a2e1a"
                  level="M"
                  includeMargin={false}
                />
              </div>

              <div>
                <p className="font-heading font-bold text-lg">
                  {user?.nickname || user?.full_name?.split(' ')[0] || 'Golfista'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
                {user?.handicap && (
                  <span className="inline-block mt-1.5 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                    HCP {user.handicap}
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Muéstrale este QR a tu amigo para que se registre y queden conectados automáticamente ⛳
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}