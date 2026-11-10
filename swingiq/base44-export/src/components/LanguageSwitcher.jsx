import { useLang, LANGUAGES } from '@/lib/i18n.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher({ className = '' }) {
  const { lang, setLang } = useLang();
  const current = LANGUAGES.find(l => l.code === lang);

  return (
    <Select value={lang} onValueChange={setLang}>
      <SelectTrigger className={`w-auto gap-2 h-9 ${className}`}>
        <Globe className="w-4 h-4 shrink-0 text-muted-foreground" />
        <SelectValue>
          <span>{current?.flag} {current?.label}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map(l => (
          <SelectItem key={l.code} value={l.code}>
            {l.flag} {l.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}