import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp } from '@/components/material-symbol'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function ScrollToTopButton({ className, threshold = 480 }) {
  const { t } = useTranslation()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    function updateVisibility() {
      setIsVisible(window.scrollY > threshold)
    }

    updateVisibility()
    window.addEventListener('scroll', updateVisibility, { passive: true })
    return () => window.removeEventListener('scroll', updateVisibility)
  }, [threshold])

  function handleClick() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!isVisible) return null

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-lg"
      aria-label={t('common.backToTop')}
      title={t('common.backToTop')}
      className={cn('fixed bottom-5 right-5 z-40 rounded-full shadow-[var(--shadow-raised)]', className)}
      onClick={handleClick}
    >
      <ArrowUp aria-hidden="true" />
    </Button>
  )
}
