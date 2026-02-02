import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Wallet } from 'lucide-react';
import LanguageSelector from '@/components/LanguageSelector';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();

  // Set document direction on mount
  useEffect(() => {
    document.documentElement.dir = i18n.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: t('errors.error'),
        description: t('validation.required'),
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);

    if (error) {
      toast({
        title: t('errors.error'),
        description: t('auth.invalidCredentials'),
        variant: 'destructive',
      });
    } else {
      toast({
        title: t('auth.welcomeBack'),
        description: t('auth.signInDescription'),
      });
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 gradient-surface opacity-50" />
      
      {/* Language selector in top right */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSelector />
      </div>
      
      <Card className="w-full max-w-md relative shadow-elevated animate-fade-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-lg">
            <Wallet className="w-8 h-8 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">{t('auth.welcomeBack')}</CardTitle>
            <CardDescription className="mt-2">
              {t('auth.signInDescription')}
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('auth.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="h-11"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('auth.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="h-11"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-11 gradient-primary text-primary-foreground font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('auth.signIn')
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
