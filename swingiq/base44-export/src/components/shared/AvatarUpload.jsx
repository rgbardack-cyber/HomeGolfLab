import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * AvatarUpload — shows a circular avatar with an overlay to upload a new photo.
 * Props:
 *   avatarUrl  — current URL (string | null)
 *   name       — fallback name for initials
 *   onUploaded — callback(newUrl) called after successful upload
 *   size       — 'sm' | 'md' | 'lg' (default 'lg')
 */
export default function AvatarUpload({ avatarUrl, name, onUploaded, size = 'lg' }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const sizes = {
    sm: 'w-9 h-9 text-sm',
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-2xl',
  };

  const initial = name?.[0]?.toUpperCase() || '?';

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.auth.updateMe({ avatar_url: file_url });
    onUploaded?.(file_url);
    setUploading(false);
  };

  return (
    <div
      className={`relative rounded-2xl overflow-hidden cursor-pointer group shrink-0 ${sizes[size]}`}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-primary/10 flex items-center justify-center">
          <span className={`font-heading font-bold text-primary ${size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-2xl'}`}>
            {initial}
          </span>
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        {uploading
          ? <Loader2 className="w-5 h-5 text-white animate-spin" />
          : <Camera className="w-5 h-5 text-white" />
        }
      </div>

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}