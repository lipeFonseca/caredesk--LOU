import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import LoginCardLayout from '@/components/LoginCardLayout'
import { useSettingsStore } from '@/store'
import { VISUAL_THEMES } from '@/theme/visualThemes'
import { getBranding, normalizeBrandingSettings, sanitizeBrandUrl, sanitizePrimaryColor, DEFAULT_LOGIN_BACKGROUND_COLOR } from '@/theme/branding'
import LoginPulsingBorder from '@/components/ui/LoginPulsingBorder'
import SmokeyBackground from '@/components/SmokeyBackground'
import { getLoginPageBackgroundStyle } from '@/components/login/loginPageBackground'

export default function BrandingSettingsTab() {
  const { setSettings } = useSettingsStore()
  const defaultForm = getDefaultFormState()
  const [form, setFormState] = useState({
    ...defaultForm,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [uploadingAsset, setUploadingAsset] = useState('')

  useEffect(() => {
    api.settings.get()
      .then((data) => {
        if (!data) return
        setFormState({ ...defaultForm, ...normalizeBrandingSettings(data) })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function set(field) {
    return (event) => {
      // Ambas passam pela mesma validação de hex; a do fundo cai no seu próprio
      // padrão quando o valor não é um hex completo.
      const nextValue = field === 'primary_color'
        ? sanitizePrimaryColor(event.target.value)
        : field === 'login_background_color'
          ? sanitizePrimaryColor(event.target.value, DEFAULT_LOGIN_BACKGROUND_COLOR)
          : event.target.value
      setFormState((current) => ({ ...current, [field]: nextValue }))
      setSuccess(false)
      setError('')
    }
  }

  function selectTheme(theme) {
    setFormState((current) => ({ ...current, primary_color: theme.primary }))
    setSuccess(false)
    setError('')
  }

  function setToggle(field) {
    return (event) => {
      setFormState((current) => ({ ...current, [field]: event.target.checked }))
      setSuccess(false)
      setError('')
    }
  }

  function setNumber(field) {
    return (event) => {
      setFormState((current) => ({ ...current, [field]: Number(event.target.value) }))
      setSuccess(false)
      setError('')
    }
  }

  async function handleAssetUpload(type, file) {
    if (!file) return
    setUploadingAsset(type)
    setError('')

    try {
      const data = type === 'logo'
        ? await api.settings.uploadLogo(file)
        : await api.settings.uploadAsset(type, file)

      const keyMap = {
        logo: 'logo_url',
        background: 'background_image_url',
        login: 'login_image_url',
        login_background: 'login_background_image_url',
        favicon: 'favicon_url',
      }

      const field = keyMap[type]
      const nextValue = sanitizeBrandUrl(data[field] || '')
      setFormState((current) => ({ ...current, [field]: nextValue }))
      const persisted = await api.settings.get().catch(() => null)
      if (persisted) {
        const normalized = normalizeBrandingSettings(persisted)
        setFormState({ ...defaultForm, ...normalized })
        setSettings(normalized)
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message || 'Nao foi possivel enviar o arquivo.')
    } finally {
      setUploadingAsset('')
    }
  }

  async function handleRemoveAsset(type) {
    setUploadingAsset(type)
    setError('')

    try {
      if (type === 'logo') await api.settings.removeLogo()
      else await api.settings.removeAsset(type)

      const keyMap = {
        logo: 'logo_url',
        background: 'background_image_url',
        login: 'login_image_url',
        login_background: 'login_background_image_url',
        favicon: 'favicon_url',
      }

      setFormState((current) => ({ ...current, [keyMap[type]]: '' }))
      const persisted = await api.settings.get().catch(() => null)
      if (persisted) {
        const normalized = normalizeBrandingSettings(persisted)
        setFormState({ ...defaultForm, ...normalized })
        setSettings(normalized)
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message || 'Nao foi possivel remover o arquivo.')
    } finally {
      setUploadingAsset('')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')

    try {
      await api.settings.update({
        ...buildSettingsPayload(form),
      })
      const persisted = await api.settings.get()
      if (persisted) {
        const normalized = normalizeBrandingSettings(persisted)
        setFormState({ ...defaultForm, ...normalized })
        setSettings(normalized)
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="h-48 animate-pulse rounded-[28px] bg-surface-container-low" />

  const activeTheme = VISUAL_THEMES.find((theme) => theme.primary.toLowerCase() === String(form.primary_color).toLowerCase())
  const branding = getBranding(form)
  const loginPageBackgroundStyle = getLoginPageBackgroundStyle(branding.loginBackgroundImageUrl)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section
        className="overflow-hidden rounded-[32px] border border-outline-variant/60 bg-[#1d342d] text-[#f7efe3] shadow-glow"
        style={branding.backgroundImageUrl ? {
          backgroundImage: `linear-gradient(90deg, rgba(21, 36, 31, 0.86), rgba(21, 36, 31, 0.56)), url("${branding.backgroundImageUrl}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      >
        <div className="grid gap-6 px-6 py-7 md:grid-cols-[minmax(0,1fr)_240px] md:px-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#d6c2a2]">Preview de marca</p>
            <h2 className="mt-3 text-display-md text-white">{branding.heroTitle}</h2>
            <p className="mt-3 max-w-2xl text-body-md text-[#ece1cf]/88">{branding.heroSubtitle}</p>
            <p className="mt-5 text-sm uppercase tracking-[0.2em] text-[#e7dac4]/82">{branding.tagline}</p>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
            <img src={branding.logoUrl} alt={`Logo da clinica ${branding.clinicName}`} className="h-20 w-20 rounded-[24px] border border-white/15 bg-white/10 object-contain p-2" />
            <h3 className="mt-4 text-headline-sm text-white">{branding.clinicName}</h3>
            <p className="mt-2 text-sm text-[#ebddc8]/86">Logo, imagem de fundo e favicon podem ser enviados nesta aba e persistem no storage do worker.</p>
          </div>
        </div>
      </section>

      <section className="card space-y-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.26em] text-on-surface-variant">Configuracoes gerais</p>
          <h2 className="mt-2 text-headline-sm text-on-surface">Identidade editorial da clinica</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Nome da clinica</label>
            <input className="input" value={form.clinic_name} onChange={set('clinic_name')} required />
          </div>
          <div>
            <label className="label">Tagline institucional</label>
            <input className="input" value={form.clinic_tagline} onChange={set('clinic_tagline')} placeholder="Frase curta para a marca" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Titulo principal</label>
            <input className="input" value={form.hero_title} onChange={set('hero_title')} placeholder="Titulo de impacto do painel" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Subtitulo principal</label>
            <textarea className="input min-h-[90px] resize-y" value={form.hero_subtitle} onChange={set('hero_subtitle')} placeholder="Texto institucional de apoio" />
          </div>
        </div>

        <div>
          <label className="label">Tema visual</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VISUAL_THEMES.map((theme) => {
              const isSelected = theme.primary.toLowerCase() === String(form.primary_color).toLowerCase()
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => selectTheme(theme)}
                  className={`rounded-[24px] border p-4 text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/6 ring-2 ring-primary/20'
                      : 'border-outline-variant bg-surface-container-low hover:border-primary/30 hover:bg-surface'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-on-surface">{theme.name}</p>
                      <p className="mt-1 text-sm text-on-surface-variant">{theme.description}</p>
                    </div>
                    {isSelected && (
                      <span className="material-symbols-outlined text-primary" style={{ fontSize: '20px' }}>check_circle</span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    {theme.swatches.map((color) => (
                      <span key={color} className="h-9 w-9 rounded-full border border-black/5 shadow-sm" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-surface-container/60 px-4 py-3">
            <span className="h-10 w-10 shrink-0 rounded-full border border-black/5 shadow-sm" style={{ backgroundColor: form.primary_color }} />
            <div>
              <p className="text-sm font-semibold text-on-surface">{activeTheme?.name ?? 'Tema personalizado legado'}</p>
              <p className="text-sm text-on-surface-variant">Cor principal aplicada na interface: {form.primary_color}</p>
            </div>
          </div>
        </div>

        <div className="max-w-xs">
          <label className="label">Fuso horario</label>
          <select className="input" value={form.timezone} onChange={set('timezone')}>
            <option value="America/Fortaleza">America/Fortaleza (BRT -3)</option>
            <option value="America/Sao_Paulo">America/Sao_Paulo (BRT -3 / BRST -2)</option>
            <option value="America/Manaus">America/Manaus (AMT -4)</option>
            <option value="America/Belem">America/Belem (BRT -3)</option>
          </select>
        </div>
      </section>

      <section className="card space-y-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.26em] text-on-surface-variant">Branding configuravel</p>
          <h2 className="mt-2 text-headline-sm text-on-surface">Assets da marca</h2>
          <p className="mt-2 text-sm text-on-surface-variant">Use upload para manter a identidade visual centralizada no storage do sistema.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <BrandAssetField title="Logo" description="Usada na sidebar, login e cards institucionais." imageUrl={form.logo_url} placeholder="https://..." value={form.logo_url} onChange={set('logo_url')} onUpload={(file) => handleAssetUpload('logo', file)} onRemove={() => handleRemoveAsset('logo')} loading={uploadingAsset === 'logo'} fit="contain" heightClass="h-32" />
          <BrandAssetField title="Imagem de fundo" description="Compoe o hero principal do painel e a atmosfera da marca." imageUrl={form.background_image_url} placeholder="https://..." value={form.background_image_url} onChange={set('background_image_url')} onUpload={(file) => handleAssetUpload('background', file)} onRemove={() => handleRemoveAsset('background')} loading={uploadingAsset === 'background'} heightClass="h-40" />
          <BrandAssetField title="Imagem da pagina de login" description="Lateral institucional da tela de login. Vazio deixa a tela sem imagem." imageUrl={form.login_image_url} placeholder="https://..." value={form.login_image_url} onChange={set('login_image_url')} onUpload={(file) => handleAssetUpload('login', file)} onRemove={() => handleRemoveAsset('login')} loading={uploadingAsset === 'login'} heightClass="h-40" />
          <BrandAssetField title="Imagem de fundo da pagina de login" description="Cobre o fundo da pagina inteira, atras do card de acesso. Vazio deixa a pagina sem fundo." imageUrl={form.login_background_image_url} placeholder="https://..." value={form.login_background_image_url} onChange={set('login_background_image_url')} onUpload={(file) => handleAssetUpload('login_background', file)} onRemove={() => handleRemoveAsset('login_background')} loading={uploadingAsset === 'login_background'} heightClass="h-40" />
          <BrandAssetField title="Favicon" description="Atualiza o icone da aba do navegador." imageUrl={form.favicon_url} placeholder="https://..." value={form.favicon_url} onChange={set('favicon_url')} onUpload={(file) => handleAssetUpload('favicon', file)} onRemove={() => handleRemoveAsset('favicon')} loading={uploadingAsset === 'favicon'} fit="contain" square />
        </div>
      </section>

      {/* Seção própria: o fundo animado é um efeito distinto da borda pulsante,
          e ficava invisível quando morava dentro da seção dela. */}
      <section className="card space-y-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.26em] text-on-surface-variant">Fundo animado do login</p>
          <h2 className="mt-2 text-headline-sm text-on-surface">Ondas atrás do card de acesso</h2>
          <p className="mt-2 max-w-xl text-sm text-on-surface-variant">
            Movimento contínuo e lento, gerado em tempo real. A cor abaixo tinge as ondas — o preview responde enquanto você escolhe.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
          <div>
            <ColorInputField
              label="Cor das ondas"
              value={form.login_background_color}
              onChange={set('login_background_color')}
            />
            <p className="mt-2 text-label-sm text-outline">
              Tons médios e saturados funcionam melhor: muito escuro some no fundo, muito claro compete com o card.
            </p>
          </div>

          <div className="relative h-56 overflow-hidden rounded-[22px] border border-outline-variant">
            <SmokeyBackground color={branding.loginBackgroundColor} />
            {/* Mesmo véu da tela real, pra o preview não prometer um brilho que
                o login não vai ter. */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(6,12,10,0.35),rgba(5,10,9,0.72))]" />
            <span className="absolute bottom-3 left-4 text-label-sm text-white/70">Prévia</span>
          </div>
        </div>
      </section>

      <section className="card space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-on-surface-variant">Borda pulsante do login</p>
            <h2 className="mt-2 text-headline-sm text-on-surface">Efeito premium do card de acesso</h2>
            <p className="mt-2 max-w-xl text-sm text-on-surface-variant">
              O efeito vive apenas no card de login. Ajuste as cores e acompanhe o resultado ao lado, na mesma composicao usada na tela publica.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 rounded-full bg-surface-container px-4 py-2 text-sm text-on-surface cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-outline-variant"
              checked={form.login_border_effect_enabled}
              onChange={setToggle('login_border_effect_enabled')}
            />
            Ativar
          </label>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(380px,1.1fr)]">
          <div className="space-y-5">
            <div>
              <label className="label">Preset</label>
              <select className="input" value={form.login_border_preset} onChange={set('login_border_preset')}>
                <option value="default">Default</option>
                <option value="circle">Circle</option>
                <option value="northern-lights">Northern lights</option>
                <option value="solid-line">Solid line</option>
              </select>
            </div>


            <div className="grid grid-cols-2 gap-4">
              <ColorInputField label="Cor 1" value={form.login_border_color_1} onChange={set('login_border_color_1')} />
              <ColorInputField label="Cor 2" value={form.login_border_color_2} onChange={set('login_border_color_2')} />
              <ColorInputField label="Cor 3" value={form.login_border_color_3} onChange={set('login_border_color_3')} />
              <ColorInputField label="Fundo do shader" value={form.login_border_color_back} onChange={set('login_border_color_back')} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <RangeField label="Intensidade" min="0" max="1" step="0.01" value={form.login_border_intensity} onChange={setNumber('login_border_intensity')} />
              <RangeField label="Velocidade" min="0" max="2" step="0.01" value={form.login_border_speed} onChange={setNumber('login_border_speed')} />
              <RangeField label="Espessura" min="0" max="1" step="0.01" value={form.login_border_thickness} onChange={setNumber('login_border_thickness')} />
              <RangeField label="Bloom" min="0" max="1" step="0.01" value={form.login_border_bloom} onChange={setNumber('login_border_bloom')} />
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-on-surface">Preview da tela de login</p>
            <div className="relative overflow-hidden rounded-[24px] bg-[#091117] p-4" style={loginPageBackgroundStyle}>
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(255,255,255,0.04),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_24%,transparent_76%,rgba(255,255,255,0.03))]" />
              <div className="pointer-events-none absolute inset-x-[12%] bottom-[-16%] top-[60%] rounded-full bg-[radial-gradient(circle,rgba(46,121,173,0.14),rgba(46,121,173,0.05)_38%,transparent_72%)] blur-3xl" />
              <LoginPulsingBorder config={branding.loginBorder} radius={24} className="overflow-hidden text-[#f8f1e6]">
                <div className="overflow-hidden bg-[#1d342d]" style={{ borderRadius: 'inherit' }}>
                  <LoginCardLayout branding={branding} compact>
                    <div className="w-full max-w-[17rem]">
                      <div className="relative mb-4">
                        <img
                          src={branding.logoUrl}
                          alt={`Logo da clinica ${branding.clinicName}`}
                          className="h-14 w-14 rounded-[18px] border border-white/12 bg-[rgba(255,255,255,0.10)] object-cover shadow-card"
                        />
                        <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-[#cfc4d3]">Entrar no painel</p>
                        <p className="mt-2 text-lg font-semibold text-[#f7f0ea]">{branding.clinicName}</p>
                        <p className="mt-1 text-sm text-[#d4c7c0]">{branding.tagline}</p>
                      </div>
                      <div className="relative space-y-3">
                        <div className="rounded-2xl border border-white/10 bg-[rgba(35,29,29,0.55)] px-4 py-3 text-sm text-[#ab9faa]">
                          nome de usuario
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-[rgba(35,29,29,0.55)] px-4 py-3 text-sm text-[#ab9faa]">
                          ********
                        </div>
                        <div className="btn-primary justify-center">Entrar</div>
                      </div>
                      <p className="relative mt-5 text-[10px] uppercase tracking-[0.22em] text-[#cbbfdf]">
                        Cuidado humano com rotina organizada
                      </p>
                    </div>
                  </LoginCardLayout>
                </div>
              </LoginPulsingBorder>
            </div>
          </div>
        </div>
      </section>

      {error && <p className="rounded-2xl bg-error-container/30 px-4 py-3 text-sm text-error">{error}</p>}
      {success && (
        <p className="flex items-center gap-2 rounded-2xl bg-secondary/10 px-4 py-3 text-sm text-secondary">
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check_circle</span>
          Configuracoes salvas com sucesso.
        </p>
      )}

      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? <Spinner /> : 'Salvar configuracoes'}
      </button>
    </form>
  )
}

function BrandAssetField({ title, description, imageUrl, value, onChange, onUpload, onRemove, loading, placeholder, heightClass = 'h-28', square, fit = 'cover' }) {
  return (
    <div className="rounded-[24px] bg-surface-container/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
        </div>
        {imageUrl && <button type="button" onClick={onRemove} className="text-sm font-semibold text-error hover:opacity-80">Remover</button>}
      </div>

      <div className={`mt-4 overflow-hidden rounded-[20px] bg-surface ${square ? 'h-24 w-24' : `${heightClass} w-full`} ${fit === 'contain' ? 'flex items-center justify-center p-3' : ''}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={title} className={fit === 'contain' ? 'max-h-full max-w-full object-contain' : 'h-full w-full object-cover'} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">Preview indisponivel</div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <input className="input" placeholder={placeholder} value={value} onChange={onChange} />
        <div className="flex flex-wrap gap-3">
          <label className="btn-ghost cursor-pointer">
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon" className="hidden" onChange={(event) => onUpload(event.target.files?.[0])} />
            {loading ? 'Enviando...' : 'Fazer upload'}
          </label>
          {imageUrl && <button type="button" onClick={onRemove} className="btn-ghost">Limpar</button>}
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
}

function getDefaultFormState() {
  return normalizeBrandingSettings({})
}

function buildSettingsPayload(form) {
  const normalized = normalizeBrandingSettings(form)
  return {
    clinic_name: normalized.clinic_name,
    clinic_tagline: normalized.clinic_tagline,
    hero_title: normalized.hero_title,
    hero_subtitle: normalized.hero_subtitle,
    primary_color: sanitizePrimaryColor(normalized.primary_color),
    logo_url: sanitizeBrandUrl(normalized.logo_url),
    background_image_url: sanitizeBrandUrl(normalized.background_image_url),
    login_image_url: sanitizeBrandUrl(normalized.login_image_url),
    login_background_image_url: sanitizeBrandUrl(normalized.login_background_image_url),
    favicon_url: sanitizeBrandUrl(normalized.favicon_url),
    login_border_effect_enabled: normalized.login_border_effect_enabled,
    login_border_preset: normalized.login_border_preset,
    login_border_color_1: normalized.login_border_color_1,
    login_border_color_2: normalized.login_border_color_2,
    login_border_color_3: normalized.login_border_color_3,
    login_border_color_back: normalized.login_border_color_back,
    login_border_intensity: normalized.login_border_intensity,
    login_border_speed: normalized.login_border_speed,
    login_border_thickness: normalized.login_border_thickness,
    login_border_bloom: normalized.login_border_bloom,
    login_background_color: normalized.login_background_color,
    timezone: normalized.timezone,
  }
}

function ColorInputField({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" className="h-11 w-11 rounded-xl border border-outline-variant cursor-pointer shrink-0" value={String(value).slice(0, 7)} onChange={onChange} />
        <input className="input" value={value} onChange={onChange} />
      </div>
    </div>
  )
}

function RangeField({ label, min, max, step, value, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="label">{label}</label>
        <span className="text-xs text-on-surface-variant">{Number(value).toFixed(2)}</span>
      </div>
      <input type="range" className="w-full accent-primary" min={min} max={max} step={step} value={value} onChange={onChange} />
    </div>
  )
}
