import { Outlet } from "react-router-dom";
import { Toast } from '@heroui/react';

export default function App() {

  return (
    <div>
      <Toast.Provider className="font-semibold" placement="top end" />
      <Outlet />
    </div>
  );
}