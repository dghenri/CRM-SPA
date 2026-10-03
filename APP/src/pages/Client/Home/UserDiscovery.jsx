import React, { useState } from "react";
import { Button } from "@heroui/react";
import Grainient from "../../../components/Grainient";
import { StepPlayer } from "../../../components/StepPlayer/StepPlayer";
import "../../../components/StepPlayer/StepPlayer.css";
import { Tag } from 'lucide-react';

const cards = [
  {
    id: 1,
    type: "coupon",
    title: "Seja muito bem-vindo(a) ao nosso SPA",
    description:
      "Para celebrar o início da sua jornada conosco você ganhou 30% de desconto na sua primeira sessão.",
    discount:"BEMVINDO30"  ,
  },
  {
    id: 2,
    type: "welcome",
    title: "Sua jornada começa aqui",
    description:
      "Conheça nossos tratamentos e encontre o momento perfeito para cuidar de você.",
  },
  {
    id: 3,
    type: "appointment",
    title: "Agende sua primeira sessão",
    description:
      "Escolha o serviço, profissional e horário que melhor combina com você.",
  },
  {
    id: 4,
    type: "services",
    title: "Descubra nossos serviços",
    description:
      "Massoterapia, estética e diversos tratamentos preparados especialmente para você.",
  },
  {
    id: 5,
    type: "profile",
    title: "Complete seu perfil",
    description:
      "Adicione algumas informações para termos uma experiência ainda mais personalizada.",
  },
];

export default function UserDiscovery() {
  // Quem avança o step é o próprio StepPlayer (autoPlay + pace) - aqui só
  // guardamos qual card mostrar, atualizado via onStepChange. Não tem mais
  // setInterval próprio: ter os dois avançando ao mesmo tempo é que fazia
  // o carrossel brigar com os pontinhos.
  const [currentStep, setCurrentStep] = useState(0);

  const currentCard = cards[currentStep];

  return (
    <div>
      <div className="relative h-55 overflow-hidden rounded-2xl bg-black p-4 mb-2">
        {/* Background */}
        <div className="absolute inset-0">
          <Grainient
            color1="#000000"
            color2="#000000"
            color3="#4881fe"
            timeSpeed={0.25}
            colorBalance={0}
            warpStrength={1.75}
            warpFrequency={5}
            warpSpeed={2}
            warpAmplitude={30}
            blendAngle={0}
            blendSoftness={0.05}
            rotationAmount={500}
            noiseScale={2}
            grainAmount={0.4}
            grainScale={7.2}
            grainAnimated={false}
            contrast={1.5}
            gamma={1}
            saturation={1}
            centerX={0}
            centerY={0}
            zoom={0.9}
          />
        </div>

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/20" />

        {/* Conteúdo da direita */}
        {currentCard.discount && (
          <div className="absolute right-4 top-1/2 z-10 -translate-y-1/2 text-right">
            <h1 className="scale-y-155 bg-linear-to-r from-white/5 to-white bg-clip-text font-serif text-7xl font-black leading-none text-transparent">
              <Tag />
            </h1>
          </div>
        )}

        {/* Conteúdo da esquerda */}
        <div className="relative z-10 h-full space-y-2">
          <h2 className="text-xl font-bold text-white">
            {currentCard.title}
          </h2>

          <p className="pr-30 text-sm text-white">
            {currentCard.description}
          </p>

          <Button
            variant="tertiary"
            className="absolute bottom-0 left-0"
          >
            {currentCard.type === "coupon"
              ? "Resgatar"
              : "Saiba mais"}
          </Button>
        </div>
      </div>

      <StepPlayer
        steps={cards.length}
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        pace={5}
        wake={100}
        autoPlay
      />
    </div>
  );
}
