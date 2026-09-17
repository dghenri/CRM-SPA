import React, { useState, useEffect, useCallback } from 'react';
import { Button, Tooltip } from "@heroui/react";
import { Maximize, Minimize } from 'lucide-react';

const FullscreenButton = ({ target } = {}) => {
  const [isFullscreen, setIsFullscreen] = useState(
    () => !!document.fullscreenElement
  );

  // Mantém o estado sincronizado mesmo quando o usuário sai da tela cheia
  // via Esc, F11 ou qualquer outro gatilho fora do nosso controle
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const elem = target?.current || document.documentElement;

    try {
      if (!document.fullscreenElement) {
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { // Safari
          await elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { // IE11
          await elem.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { // Safari
          await document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { // IE11
          await document.msExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Erro ao alternar tela cheia:', err);
    }
  }, [target]);

  return (
    <Tooltip delay={200}>
    <Tooltip.Trigger>
      <Button
        variant="ghost"
        size="lg"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Minimize' : 'Maximize'}
        aria-pressed={isFullscreen}
        className="mb-4 mr-2"
        >
        {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
    </Button>
    </Tooltip.Trigger>
    <Tooltip.Content className="font-semibold">
      <Tooltip.Arrow />
      {isFullscreen ? "Minimizar" : "Maximizar"}
    </Tooltip.Content>
  </Tooltip>
    
  );
};

export default FullscreenButton;
