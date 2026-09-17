import React, { useEffect, useState } from 'react'
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectFade } from "swiper/modules";
import { Camera } from 'lucide-react'

import "swiper/css";
import "swiper/css/effect-fade";

// Carrega todas as imagens da pasta
const importedImages = Object.values(
  import.meta.glob(
    "../assets/Carosel/*.{jpg,jpeg,png,webp}",
    {
      eager: true,
      import: "default",
    }
  )
);

const slides = [
  {
    image: importedImages[0],
    title: "Sua jornada começa aqui",
    subtitle: "Organize projetos, clientes e tarefas em um só lugar.",
    author: "Alesia Kozik | Pexels",
  },
  {
    image: importedImages[1],
    title: "Transforme ideias em realidade",
    subtitle: "Planeje e execute seus projetos com eficiência.",
    author: "Monstera Production | Pexels",
  },
  {
    image: importedImages[2],
    title: "Produtividade sem limites",
    subtitle: "Tudo que você precisa em uma única plataforma.",
    author: "Monstera Production | Pexels",
  },
];

export default function LoginCarousel() {
    const [activeIndex, setActiveIndex] = useState(0);

    return (
        <div className="relative h-full w-full overflow-hidden rounded-3xl">
            <Swiper
            modules={[Autoplay, EffectFade]}
            effect="fade"
            loop={true}
            autoplay={{
                delay: 9000,
                disableOnInteraction: false,
            }}
            speed={1500}
            onSlideChange={(swiper) => setActiveIndex(swiper.realIndex)}
            className="h-full w-full"
            >
                {slides.map((slide, index) => (
                    <SwiperSlide key={index}>
                        <img
                            src={slide.image}
                            alt={slide.title}
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                    </SwiperSlide>
                ))}
            </Swiper>

            {/* Gradiente escuro */}
            <div className="absolute bottom-0 left-0 right-0 h-1/8 z-10 bg-linear-to-t from-black/80 to-transparent" />

            {/* Blur inferior */}
            <div
                className="
                absolute inset-x-0 bottom-0 h-1/3
                backdrop-blur-lg z-10
                mask-[linear-gradient(to_top,black,transparent)]
                [-webkit-mask-image:linear-gradient(to_top,black,transparent)]
                "
            />

            {/* Conteúdo */}
            <div key={activeIndex}
                className="
                    absolute bottom-6 left-6 z-20 max-w-md
                    animate-[fadeIn_1s_ease-out]
                "
                >
                <h2 className="text-4xl md:text-3xl lg:text-4xl font-bold text-white">
                {slides[activeIndex].title}
                </h2>

                <p className="mt-2 text-white/80">
                {slides[activeIndex].subtitle}
                </p>
                <p className="flex mt-3 text-white/40 text-sm items-center tracking-wider gap-2">
                    <Camera size={16} />{slides[activeIndex].author}
                </p>
            </div>
        </div> 
    )
}
