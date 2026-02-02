import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Globe } from 'lucide-react';

const languages = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
];

export default function LanguageSelector() {
  const { i18n } = useTranslation();

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    // Update document direction for RTL languages
    const selectedLang = languages.find(l => l.code === lang);
    document.documentElement.dir = selectedLang?.dir || 'ltr';
    document.documentElement.lang = lang;
  };

  return (
    <Select value={i18n.language} onValueChange={handleLanguageChange}>
      <SelectTrigger className="w-auto gap-1.5 h-8 px-2 border-none bg-transparent hover:bg-accent">
        <Globe className="w-4 h-4" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {languages.map((lang) => (
          <SelectItem key={lang.code} value={lang.code}>
            {lang.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}