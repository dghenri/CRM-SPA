import React, { useId } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar } from '@heroui/react';
import { useAuth } from '../context/AuthContext';
import { assetUrl } from '../api/api';

const GLYPHS = {
  home: {
    viewBox: '0 0 24 24',
    outer: [
      'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    ],
    inner: ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8'],
  },
  leaf: {
    viewBox: '0 0 24 24',

    outer: [
      'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z',
    ],

    inner: [
      'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12',
    ],
  },
  calendarCheck: {
    viewBox: '0 0 24 24',
    outerRect: { x: 3, y: 4, width: 18, height: 18, rx: 2 },
    inner: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'm9 16 2 2 4-4'],
  },
};

const navItems = [
  { key: 'home', label: 'Início', glyph: 'home', path: '/user' },
  {
    key: 'procedimentos',
    label: 'Procedimentos',
    glyph: 'leaf',
    path: '/user/services',
  },
  {
    key: 'agendamentos',
    label: 'Agendamentos',
    glyph: 'calendarCheck',
    path: '/user/scheduling',
  },
  {
    key: 'perfil',
    label: 'Perfil',
    path: '/user/profile',
    isProfile: true,
  },
];

const INK_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const INK_DURATION = '480ms';

const OUTLINE_COLOR = '#474747';
const FILL_COLOR = '#222222';
const BG_COLOR = '#FFFFFF'; // mesma cor do fundo do menu (bg-white no <nav>) —

const InkIcon = ({ glyph, active, size = 24 }) => {
  const g = GLYPHS[glyph];
  const reactId = useId();
  const clipId = `${glyph}-outer-clip-${reactId}`;

  const strokeCommon = {
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };

  // Silhueta externa, reutilizada tanto pra preencher quanto como máscara
  // de recorte (clip) da parte do traço interno que cai dentro dela.
  const renderOuterShape = (props) =>
    g.outerRect ? (
      <rect {...g.outerRect} {...props} />
    ) : (
      g.outer.map((d, i) => <path key={i} d={d} {...props} />)
    );

  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size }}
    >
      {/* camada preenchida, revelada via clip-path circular quando ativo */}
      <svg
        viewBox={g.viewBox}
        width={size}
        height={size}
        className="absolute inset-0"
        style={{
          clipPath: active ? 'circle(75% at 50% 50%)' : 'circle(0% at 50% 50%)',
          transition: `clip-path ${INK_DURATION} ${INK_EASE}`,
        }}
      >
        {renderOuterShape({ fill: FILL_COLOR })}
      </svg>

      {/* camada de contorno + galho, sempre visível */}
      <svg viewBox={g.viewBox} width={size} height={size} className="absolute inset-0">
        <defs>
          <clipPath id={clipId}>{renderOuterShape({})}</clipPath>
        </defs>

        {g.outerRect ? (
          <rect
            {...g.outerRect}
            fill="none"
            stroke={active ? FILL_COLOR : OUTLINE_COLOR}
            strokeWidth={1.75}
            style={{ transition: `stroke ${INK_DURATION} ${INK_EASE}` }}
          />
        ) : (
          g.outer.map((d, i) => (
            <path
              key={i}
              d={d}
              stroke={active ? FILL_COLOR : OUTLINE_COLOR}
              {...strokeCommon}
              style={{ transition: `stroke ${INK_DURATION} ${INK_EASE}` }}
            />
          ))
        )}

        {/* Traço interno (galho) inteiro, sempre desenhado numa cor escura —
            garante que a parte que fica FORA da folha nunca desapareça,
            ativo ou não. */}
        {g.inner.map((d, i) => (
          <path
            key={i}
            d={d}
            stroke={active ? FILL_COLOR : OUTLINE_COLOR}
            {...strokeCommon}
            style={{ transition: `stroke ${INK_DURATION} ${INK_EASE}` }}
          />
        ))}

        {/* Por cima, só a parte do traço que cai DENTRO da folha vira branca
            quando ativo (efeito "carved"). Fora da folha, o clip não deixa
            nada ser pintado, então continua na cor escura do traço acima. */}
        <g
          clipPath={`url(#${clipId})`}
          style={{
            opacity: active ? 1 : 0,
            transition: `opacity ${INK_DURATION} ${INK_EASE}`,
          }}
        >
          {g.inner.map((d, i) => (
            <path key={i} d={d} stroke={BG_COLOR} {...strokeCommon} />
          ))}
        </g>
      </svg>
    </span>
  );
};

const getInitials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');



/**
 * Menu inferior mobile.
 * @param {{ name?: string, avatarUrl?: string }} [client] - dados do
 * cliente a exibir no ícone de Perfil. Opcional: se omitido, usa o
 * usuário logado do AuthContext automaticamente. Passe essa prop só
 * se precisar sobrescrever isso manualmente (ex: testes).
 */
const Menu = ({ client }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();


  const isActive = (path) => location.pathname === path;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-100 bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="flex items-center justify-around px-2 py-2">
        {navItems.map(({ key, label, glyph, path, isProfile }) => {
          const active = isActive(path);

          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => navigate(path)}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                className="flex flex-col items-center gap-1 rounded-xl px-3 py-1
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-neutral-900"
              >
                {isProfile ? (
                  <Avatar
                    size="sm"
                    className={`${active ? 'ring-2 ring-offset-2 ring-offset-white ring-focus' : ''}`}
                    style={{ transition: `box-shadow ${INK_DURATION} ${INK_EASE}` }}
                  >
                    {user?.avatarUrl && <Avatar.Image alt={user?.name} src={assetUrl(user.avatarUrl)} />}
                    <Avatar.Fallback>{loading ? "" : getInitials(user?.name)}</Avatar.Fallback>
                  </Avatar>
                ) : (
                  <InkIcon glyph={glyph} active={active} />
                )}
                <span
                  className="text-[11px] font-medium"
                  style={{
                    color: active ? FILL_COLOR : OUTLINE_COLOR,
                    transition: `color ${INK_DURATION} ${INK_EASE}`,
                  }}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default Menu;
