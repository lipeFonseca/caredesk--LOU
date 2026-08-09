// Layout interno do card de login: coluna institucional à esquerda, coluna de
// credenciais à direita.

function getLoginImageStyle(imageUrl) {
  if (!imageUrl) return undefined

  return {
    backgroundImage: `linear-gradient(180deg, rgba(21, 36, 31, 0.68), rgba(21, 36, 31, 0.9)), url("${imageUrl}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}

// Vidro de verdade depende do fundo ATRAVESSAR o painel. A versão anterior usava
// marrom-neutro a 68% de opacidade com blur máximo: o fundo sumia e sobrava um
// cinza chapado. Aqui a base é o verde da marca em opacidade baixa, o blur é
// moderado e a saturação alta faz a imagem atrás vibrar através do vidro.
//
// O gradiente escurece de cima para baixo de propósito — é embaixo que ficam os
// campos e o botão, e a legibilidade do formulário vem antes do efeito.
// Glassmorphism claro: o vidro é uma camada de BRANCO translúcido, não uma
// camada escura. É essa inversão que separa "vidro" de "placa cinza" — o fundo
// atravessa e o painel parece iluminado por trás, em vez de tapá-lo.
const GLASS_BASE = [
  'relative flex items-center justify-center overflow-hidden',
  'border-l border-white/20',
  'bg-white/10 backdrop-blur-lg backdrop-saturate-[1.6]',
  // Aresta de luz no topo e à esquerda: é o que o olho lê como espessura.
  'shadow-[inset_1px_0_0_rgba(255,255,255,0.22),inset_0_1px_0_rgba(255,255,255,0.18)]',
].join(' ')

export default function LoginCardLayout({ branding, children, compact = false }) {
  const shellClassName = compact
    ? 'grid min-h-[22rem] gap-0 md:grid-cols-[1.12fr_0.88fr]'
    : 'relative grid overflow-hidden lg:grid-cols-[1.15fr_0.85fr]'
  const leftSectionClassName = compact
    ? 'relative flex min-h-[15rem] flex-col justify-between overflow-hidden bg-[#1d342d] p-5 text-[#f8f1e6]'
    : 'relative hidden min-h-[620px] overflow-hidden bg-[#1d342d] p-10 text-[#f8f1e6] lg:flex lg:flex-col'
  const leftTitleClassName = compact ? 'mt-3 text-2xl font-semibold text-white' : 'mt-4 text-display-lg text-white'
  const leftSubtitleClassName = compact
    ? 'mt-3 text-sm leading-6 text-[#ece1cf]/88'
    : 'mt-4 max-w-md text-body-lg text-[#ece1cf]/88'
  const leftFooterClassName = compact
    ? 'relative mt-8 rounded-[20px] border border-white/10 bg-white/8 p-4 backdrop-blur-sm'
    : 'relative mt-auto rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm'
  const leftLogoClassName = compact
    ? 'h-12 w-12 rounded-[16px] border border-white/15 bg-white/10 object-contain p-1.5'
    : 'h-16 w-16 rounded-[20px] border border-white/15 bg-white/10 object-cover'
  const leftClinicNameClassName = compact ? 'text-sm font-semibold text-white' : 'text-headline-sm text-white'
  const leftTaglineClassName = compact ? 'mt-1 text-xs text-[#e7dac4]/84' : 'mt-1 text-sm text-[#e7dac4]/84'
  const rightSectionClassName = compact
    ? `${GLASS_BASE} px-5 py-6`
    : `${GLASS_BASE} p-6 sm:p-8 lg:p-10`

  const leftSectionStyle = {
    ...getLoginImageStyle(branding.loginImageUrl),
    borderTopLeftRadius: 'var(--login-card-inner-radius)',
    borderBottomLeftRadius: 'var(--login-card-inner-radius)',
  }
  const rightSectionStyle = {
    borderTopRightRadius: 'var(--login-card-inner-radius)',
    borderBottomRightRadius: 'var(--login-card-inner-radius)',
  }

  return (
    <div className={shellClassName}>
      <section className={leftSectionClassName} style={leftSectionStyle}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_35%)]" />
        <div className="relative">
          <h1 className={leftTitleClassName}>{branding.heroTitle}</h1>
          <p className={leftSubtitleClassName}>{branding.heroSubtitle}</p>
        </div>

        <div className={leftFooterClassName}>
          <div className="flex items-center gap-4">
            <img
              src={branding.logoUrl}
              alt={`Logo da clinica ${branding.clinicName}`}
              className={leftLogoClassName}
            />
            <div>
              <h2 className={leftClinicNameClassName}>{branding.clinicName}</h2>
              <p className={leftTaglineClassName}>{branding.tagline}</p>
            </div>
          </div>
        </div>
      </section>

      <section className={rightSectionClassName} style={rightSectionStyle}>
        {/* Reflexo especular: concentra luz no topo e some antes da metade, que
            é onde o formulário começa. Dá volume ao vidro sem lavar o texto. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-2/5 bg-[radial-gradient(130%_100%_at_50%_0%,rgba(255,255,255,0.20),rgba(255,255,255,0.06)_45%,transparent_75%)]"
        />
        {/* Vinheta inferior: com vidro claro o texto branco depende dela para
            manter contraste quando a imagem atrás tiver uma área clara. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-[linear-gradient(180deg,transparent,rgba(10,20,17,0.38))]"
        />
        <div className="relative w-full">{children}</div>
      </section>
    </div>
  )
}
