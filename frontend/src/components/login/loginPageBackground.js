export function getLoginPageBackgroundStyle(backgroundImageUrl) {
  const layers = [
    'radial-gradient(circle at 16% 18%, rgba(52, 104, 136, 0.22), transparent 30%)',
    'radial-gradient(circle at 84% 14%, rgba(97, 126, 165, 0.16), transparent 24%)',
    'radial-gradient(circle at 50% 82%, rgba(16, 67, 89, 0.18), transparent 30%)',
    'linear-gradient(135deg, #091117 0%, #0f1720 36%, #17222d 100%)',
  ]

  if (backgroundImageUrl) {
    layers.unshift(
      'linear-gradient(135deg, rgba(7, 13, 19, 0.82), rgba(11, 18, 27, 0.74) 42%, rgba(14, 22, 31, 0.9) 100%)',
      `url("${backgroundImageUrl}")`
    )
  }

  return {
    backgroundColor: '#091117',
    backgroundImage: layers.join(', '),
    backgroundSize: backgroundImageUrl
      ? 'cover, cover, auto, auto, auto, auto'
      : 'auto, auto, auto, auto',
    backgroundPosition: backgroundImageUrl
      ? 'center, center, 16% 18%, 84% 14%, 50% 82%, center'
      : '16% 18%, 84% 14%, 50% 82%, center',
  }
}
