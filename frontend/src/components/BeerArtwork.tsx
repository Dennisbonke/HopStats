import { useState } from "react";
import type { ExploreBeer } from "../api/explore";
import { safeImageUrl } from "../utils/explorer";

export default function BeerArtwork({
  beer,
}: {
  beer: Pick<ExploreBeer, "name" | "photo_url">;
}) {
  const [failed, setFailed] = useState(false);
  if (!safeImageUrl(beer.photo_url) || failed) {
    return (
      <span
        className="explorer-beer-artwork-fallback"
        role="img"
        aria-label={`${beer.name} artwork unavailable`}
      >
        Beer
      </span>
    );
  }
  return (
    <img
      className="explorer-beer-artwork"
      src={safeImageUrl(beer.photo_url)!}
      alt={`${beer.name} artwork`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
