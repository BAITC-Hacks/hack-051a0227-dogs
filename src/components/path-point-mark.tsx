/** Decorative companion to the textual amount, never an admission indicator. */
export function PathPointMark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="path-coin-mark"
      src="/images/invision/path-coin-64.webp"
      srcSet="/images/invision/path-coin-128.webp 2x"
      width={28}
      height={28}
      alt=""
      aria-hidden="true"
    />
  );
}
