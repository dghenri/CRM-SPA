import React from 'react'
import { Button } from "@heroui/react";
import { useAuth } from "../context/AuthContext";

export default function ComingSoon() {
  const { logout } = useAuth();

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center pointer-events-auto md:hidden">
      <p className="font-semibold text-muted">Mobile support coming soon</p>
      <div>
        <Button
          slot="close"
          variant="danger"
          onPress={() => { logout() }}
        >
          Sair
        </Button>
      </div>
    </div>
  )
}
