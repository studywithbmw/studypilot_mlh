import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { CommandPalette } from './CommandPalette';
import { OfflineIndicator } from './OfflineIndicator';
import { ZenAmbientFocusModal } from '../study/ZenAmbientFocusModal';
import { useSettingsStore, applyTheme } from '../../store/useSettingsStore';

export const AppShell: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const { theme } = useSettingsStore();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="min-h-screen flex bg-background text-foreground overflow-x-hidden">
      {/* Sidebar navigation */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Viewport Frame */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        <Topbar onOpenCommand={() => setCommandOpen(true)} />

        <main className="flex-1 flex flex-col min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav onOpenMenu={() => setMobileMenuOpen(true)} />

      {/* Global Command Palette */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

      {/* Offline Mode Indicator Banner */}
      <OfflineIndicator />

      {/* Zen Ambient Focus Mode powered by WebGL ShaderBackground */}
      <ZenAmbientFocusModal />
    </div>
  );
};
