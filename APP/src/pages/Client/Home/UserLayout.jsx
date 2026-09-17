import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Menu from '../../../components/Menu';

const HIDDEN_MENU_ROUTES = [/^\/user\/services\/[^/]+\/?$/];

export default function ClientLayout() {
  const location = useLocation();

  useEffect(() => {
    document.title = 'Home | Viva Bem SPA';
  }, []);

  // const client = useClient();
  const client = { name: 'Ana Souza', avatarUrl: undefined }; // placeholder

  const hideMenu = HIDDEN_MENU_ROUTES.some((pattern) => pattern.test(location.pathname));

  return (
    <div className="flex min-h-screen flex-col">
      {/* pb-20 só é necessário quando o menu tá visível, pra abrir espaço
          pra ele não tampar o conteúdo. Sem o menu, o conteúdo pode usar
          a altura toda. */}
      <main className={`flex-1 ${hideMenu ? '' : 'pb-20'}`}>
        <Outlet />
      </main>

      {!hideMenu && <Menu client={client} />}
    </div>
  );
}
