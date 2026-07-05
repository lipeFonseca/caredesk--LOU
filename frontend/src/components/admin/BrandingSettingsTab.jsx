import { useEffect, useState } from 'react'
import { api } from '@/services/api'
import { useSettingsStore } from '@/store'
import { VISUAL_THEMES } from '@/theme/visualThemes'
import { getBranding } from '@/theme/branding'

export default function BrandingSettingsTab() {
  const { setSettings } = useSettingsStore()
  const [form, setFormState] = useState({
    clinic_name: '',
    clinic_tagline: '',
    hero_title: '',
    hero_subtitle: '',
    primary_color: '#5f8fba',
    logo_url: '',
    background_image_url: '',
    favicon_url: '',
    timezone: 'America/Fortaleza',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [uploadingAsset, setUploadingAsset] = useState('')

  useEffect(() => {
    api.settings.get()
      .then((data) => { if (data) setFormState((current) => ({ ...current, ...data })) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function set(field) {
    return (event) => {
      setFormState((current) => ({ ...current, [field]: event.target.value }))
      setSuccess(false)
      setError('')
    }
  }

  function selectTheme(theme) {
    setFormState((current) => ({ ...current, primary_color: theme.primary }))
    setSuccess(false)
    setError('')
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
        favicon: 'favicon_url',
      }

      const field = keyMap[type]
      setFormState((current) => ({ ...current, [field]: data[field] || '' }))
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
        favicon: 'favicon_url',
      }

      setFormState((current) => ({ ...current, [keyMap[type]]: '' }))
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
      await api.settings.update(form)
      setSettings(form)
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
            <img src={branding.logoUrl} alt={`Logo da clinica ${branding.clinicName}`} className="h-20 w-20 rounded-[24px] border border-white/15 bg-white/10 object-cover" />
            <h3 className="mt-4 text-headline-sm text-white">{branding.clinicName}</h3>
            <p className="mt-2 text-sm text-[#ebddc8]/86">Logo, imagem de fundo e favicon podem ser enviados nesta aba e persistem no storage do worker.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <section className="card space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-on-surface-variant">Configuracoes gerais</p>
            <h2 className="mt-2 text-headline-sm text-on-surface">Identidade editorial da clinica</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Nome da clinica</label>
              <input className="input" value={form.clinic_name} onChange={set('clinic_name')} required />
            </div>
            <div className="md:col-span-2">
              <label className="label">Tagline institucional</label>
              <input className="input" value={form.clinic_tagline} onChange={set('clinic_tagline')} placeholder="Frase curta para a marca" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Titulo principal</label>
              <input className="input" value={form.hero_title} onChange={set('hero_title')} placeholder="Titulo de impacto do painel" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Subtitulo principal</label>
              <textarea className="input min-h-[110px] resize-y" value={form.hero_subtitle} onChange={set('hero_subtitle')} placeholder="Texto institucional de apoio" />
            </div>
          </div>

          <div>
            <label className="label">Tema visual</label>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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

            <div className="mt-4 rounded-[22px] border border-outline-variant bg-surface-container px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-on-surface-variant">Tema selecionado</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="h-11 w-11 rounded-full border border-black/5 shadow-sm" style={{ backgroundColor: form.primary_color }} />
                <div>
                  <p className="text-sm font-semibold text-on-surface">{activeTheme?.name ?? 'Tema personalizado legado'}</p>
                  <p className="text-sm text-on-surface-variant">Cor principal aplicada na interface: {form.primary_color}</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Fuso horario</label>
            <select className="input" value={form.timezone} onChange={set('timezone')}>
              <option value="America/Fortaleza">America/Fortaleza (BRT -3)</option>
              <option value="America/Sao_Paulo">America/Sao_Paulo (BRT -3 / BRST -2)</option>
              <option value="America/Manaus">America/Manaus (AMT -4)</option>
              <option value="America/Belem">America/Belem (BRT -3)</option>
            </select>
          </div>
        </section>

        <section className="card space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.26em] text-on-surface-variant">Branding configuravel</p>
            <h2 className="mt-2 text-headline-sm text-on-surface">Assets da marca</h2>
            <p className="mt-2 text-sm text-on-surface-variant">Use upload para manter a identidade visual centralizada no storage do sistema.</p>
          </div>

          <div className="space-y-4">
            <BrandAssetField title="Logo" description="Usada na sidebar, login e cards institucionais." imageUrl={form.logo_url} placeholder="https://..." value={form.logo_url} onChange={set('logo_url')} onUpload={(file) => handleAssetUpload('logo', file)} onRemove={() => handleRemoveAsset('logo')} loading={uploadingAsset === 'logo'} />
            <BrandAssetField title="Imagem de fundo" description="Compoe o hero principal do painel e a atmosfera da marca." imageUrl={form.background_image_url} placeholder="https://..." value={form.background_image_url} onChange={set('background_image_url')} onUpload={(file) => handleAssetUpload('background', file)} onRemove={() => handleRemoveAsset('background')} loading={uploadingAsset === 'background'} tall />
            <BrandAssetField title="Favicon" description="Atualiza o icone da aba do navegador." imageUrl={form.favicon_url} placeholder="https://..." value={form.favicon_url} onChange={set('favicon_url')} onUpload={(file) => handleAssetUpload('favicon', file)} onRemove={() => handleRemoveAsset('favicon')} loading={uploadingAsset === 'favicon'} iconOnly />
          </div>
        </section>
      </div>

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

function BrandAssetField({ title, description, imageUrl, value, onChange, onUpload, onRemove, loading, placeholder, tall, iconOnly }) {
  return (
    <div className="rounded-[24px] border border-outline-variant bg-surface-container p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
        </div>
        {imageUrl && <button type="button" onClick={onRemove} className="text-sm font-semibold text-error hover:opacity-80">Remover</button>}
      </div>

      <div className={`mt-4 overflow-hidden rounded-[20px] border border-outline-variant/70 bg-surface ${tall ? 'h-40' : iconOnly ? 'h-20 w-20' : 'h-24'}`}>
        {imageUrl ? <img src={imageUrl} alt={title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-on-surface-variant">Preview indisponivel</div>}
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
