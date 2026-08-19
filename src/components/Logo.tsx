/**
 * Firmenlogo. Aus App.tsx herausgelöst, weil Login-Bildschirm und TV-Ansicht
 * es ebenfalls verwenden.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo.png?v=1.0.4`}
      alt="Malerprofis Uderstadt Logo"
      className={className}
    />
  );
}

export default Logo;
