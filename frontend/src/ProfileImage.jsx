import { getProfileImageFallbackSrc, resolveProfileImageSrc } from './profileImageSupport'

export function ProfileImage({ alt = '', className = '', src, gender = null }) {
  const resolvedSrc = resolveProfileImageSrc({ src, gender })
  const isGenderDefault = !src && (gender === 'female' || gender === 'male')
  const resolvedClassName = `${className} ${isGenderDefault ? 'profile-image--gender-default' : ''}`.trim()

  const handleError = (event) => {
    if (!event.currentTarget.dataset.fallbackApplied) {
      event.currentTarget.dataset.fallbackApplied = 'true'
      event.currentTarget.src = getProfileImageFallbackSrc()
    }
  }

  return (
    <img
      alt={alt}
      className={resolvedClassName}
      src={resolvedSrc}
      onError={handleError}
      loading="lazy"
    />
  )
}
