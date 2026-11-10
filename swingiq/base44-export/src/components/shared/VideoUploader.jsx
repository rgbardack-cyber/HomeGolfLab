import { useState, useRef } from 'react';
import { Upload, Video, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function VideoUploader({ onUpload, label = "Subir Video", accept = "video/*" }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploading(false);
    onUpload(file_url);
  };

  return (
    <div className="space-y-3">
      {!preview ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-all"
        >
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-medium text-foreground">{label}</p>
            <p className="text-sm text-muted-foreground mt-1">MP4, MOV hasta 100MB</p>
          </div>
        </button>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-black">
          <video src={preview} controls className="w-full max-h-64 object-contain" />
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}
          <button
            onClick={() => { setPreview(null); }}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}