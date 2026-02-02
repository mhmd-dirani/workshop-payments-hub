import { ReactNode } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  LogOut, 
  Wallet,
  ClipboardCheck,
  Settings,
  HandCoins,
  Users2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import LanguageSelector from '@/components/LanguageSelector';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, role, signOut } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const navigation = [
    { name: t('nav.dashboard'), href: '/', icon: LayoutDashboard },
    ...(role === 'admin' ? [
      { name: t('nav.pendingApprovals'), href: '/approvals', icon: ClipboardCheck },
      { name: t('nav.team'), href: '/team', icon: Users2 },
      { name: t('nav.debts'), href: '/debts', icon: HandCoins },
      { name: t('nav.manageUsers'), href: '/users', icon: Settings },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
        <div className="container flex h-14 md:h-16 items-center justify-between px-3 md:px-6">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Wallet className="w-4 h-4 md:w-5 md:h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground text-sm md:text-base">Workshop Payments</h1>
              <p className="text-xs text-muted-foreground capitalize">{role || 'Loading...'}</p>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link 
                  key={item.name} 
                  to={item.href}
                  onClick={(e) => {
                    if (item.href === '/' && location.pathname === '/') {
                      e.preventDefault();
                      window.location.href = '/';
                    }
                  }}
                >
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'gap-2',
                      isActive && 'bg-secondary'
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </Button>
                </Link>
              );
            })}
          </nav>
          
          <div className="flex items-center gap-1">
            <LanguageSelector />
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSignOut}
              className="gap-1 h-8 px-2 md:px-3"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{t('auth.signOut')}</span>
            </Button>
          </div>
        </div>
      </header>
      
      {/* Mobile Navigation - Icon only on mobile */}
      <nav className="md:hidden border-b bg-card sticky top-14 z-40">
        <div className="flex justify-around py-1.5">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link 
                key={item.name} 
                to={item.href}
                onClick={(e) => {
                  if (item.href === '/' && location.pathname === '/') {
                    e.preventDefault();
                    window.location.href = '/';
                  }
                }}
                className="flex flex-col items-center"
              >
                <Button
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    'h-8 w-8 p-0',
                    isActive && 'bg-secondary'
                  )}
                >
                  <item.icon className="w-4 h-4" />
                </Button>
                <span className={cn(
                  "text-[10px] mt-0.5",
                  isActive ? "text-primary font-medium" : "text-muted-foreground"
                )}>
                  {item.name.split(' ')[0]}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
      
      {/* Main Content */}
      <main className="container py-3 md:py-6 px-3 md:px-6">
        {children}
      </main>
    </div>
  );
}
