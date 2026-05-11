import placeholderImage from './assets/placeholder600x400.png'

export function ProfileImage({ alt = '', className = '', src }) {
  const handleError = (event) => {
    if (!event.currentTarget.dataset.fallbackApplied) {
      event.currentTarget.dataset.fallbackApplied = 'true'
      event.currentTarget.src = placeholderImage
    }
  }

  return (
    <img
      alt={alt}
      className={className}
      src={src || placeholderImage}
      onError={handleError}
      loading="lazy"
    />
  )
}
