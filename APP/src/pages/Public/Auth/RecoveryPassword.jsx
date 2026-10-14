import React, { useEffect } from 'react'

export default function RecoveryPassword() {
      useEffect(() => {
        document.title = "Recovery | Viva Bem SPA";
      }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-6xl font-bold">Recovery</h1>
    </div>
  )
}
