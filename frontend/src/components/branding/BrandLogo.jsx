import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBrandLogo, normalizeBrandingPayload } from '@/lib/branding';

const SIZE_MAP = {
  sm: { wrap: 'h-12 w-14', icon: 'h-5 w-5' },
  md: { wrap: 'h-14 w-16', icon: 'h-6 w-6' },
  lg: { wrap: 'h-20 w-24', icon: 'h-8 w-8' },
};

export const BrandLogo = ({
  branding,
  size = 'md',
  className = '',
  logoTestId = 'brand-logo-image',
  titleTestId = 'brand-logo-title',
  subtitleTestId = 'brand-logo-subtitle',
  title,
  subtitle,
  showText = false,
}) => {
  const normalized = normalizeBrandingPayload(branding);
  const logoSrc = getBrandLogo(normalized);
  const config = SIZE_MAP[size] || SIZE_MAP.md;
  const resolvedTitle = title || normalized.company_info?.name || normalized.company_name;
  const resolvedSubtitle = subtitle || normalized.company_info?.subtitle || 'Manager';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn('relative overflow-hidden rounded-2xl border', config.wrap)}
        style={{
          borderColor: 'rgba(var(--brand-primary-rgb), 0.2)',
          background: 'linear-gradient(180deg, rgba(var(--brand-primary-rgb), 0.12), rgba(9,9,11,0.12))',
        }}
      >
        <div className="absolute inset-0 brand-logo-halo" />
        {logoSrc ? (
          <img
            data-testid={logoTestId}
            src={logoSrc}
            alt={resolvedTitle}
            className="relative h-full w-full object-contain p-2"
          />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center text-white/90">
            <Building2 className={config.icon} />
          </div>
        )}
      </div>

      {showText && (
        <div className="min-w-0">
          <p data-testid={titleTestId} className="truncate text-lg font-black uppercase tracking-tight text-white">
            {resolvedTitle}
          </p>
          <p data-testid={subtitleTestId} className="truncate text-xs uppercase tracking-[0.22em] text-zinc-400">
            {resolvedSubtitle}
          </p>
        </div>
      )}
    </div>
  );
};