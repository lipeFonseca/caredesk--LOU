function getLoginImageStyle(imageUrl) {
  if (!imageUrl) return undefined

  return {
    backgroundImage: `linear-gradient(180deg, rgba(21, 36, 31, 0.68), rgba(21, 36, 31, 0.9)), url("${imageUrl}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}

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
    ? 'relative flex items-center justify-center overflow-hidden border-l border-white/8 bg-[linear-gradient(180deg,rgba(34,28,29,0.68),rgba(24,20,21,0.50))] px-5 py-6 backdrop-blur-2xl backdrop-saturate-150'
    : 'relative flex items-center justify-center overflow-hidden border-l border-white/8 bg-[linear-gradient(180deg,rgba(34,28,29,0.68),rgba(24,20,21,0.50))] p-6 backdrop-blur-2xl backdrop-saturate-150 sm:p-8 lg:p-10'

  return (
    <div className={shellClassName}>
      <section className={leftSectionClassName} style={getLoginImageStyle(branding.loginImageUrl)}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_35%)]" />
        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.3em] text-[#d6c2a2]">Acesso institucional</p>
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

      <section className={rightSectionClassName}>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_28%,transparent_72%,rgba(255,255,255,0.04))]" />
        {children}
      </section>
    </div>
  )
}
