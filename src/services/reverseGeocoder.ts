type NominatimAddress = {
  amenity?: string;
  building?: string;
  university?: string;
  tourism?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  country?: string;
};

type NominatimResponse = {
  display_name?: string;
  address?: NominatimAddress;
};

export type PlaceInformation = {
  placeName: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
};

const NOMINATIM_URL =
  process.env.NOMINATIM_URL ||
  "https://nominatim.openstreetmap.org";

const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  "PopBusShowcase/1.0 (https://pop-bus-web.vercel.app/)";

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1100;

const placeCache = new Map<
  string,
  {
    value: PlaceInformation;
    expiresAt: number;
  }
>();

let lastRequestAt = 0;
let geocodeQueue: Promise<unknown> = Promise.resolve();

function createCacheKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

function uniqueParts(parts: Array<string | undefined>) {
  return [...new Set(parts.filter(Boolean))] as string[];
}

function createPlaceName(
  address: NominatimAddress,
  displayName: string
) {
  const landmark =
    address.amenity ||
    address.university ||
    address.tourism ||
    address.building;

  const area =
    address.road ||
    address.neighbourhood ||
    address.suburb ||
    address.city_district;

  const city =
    address.city ||
    address.town ||
    address.village;

  const parts = uniqueParts([
    landmark,
    area,
    city,
    address.state,
  ]).slice(0, 3);

  return parts.length > 0
    ? parts.join(", ")
    : displayName;
}

async function waitForRateLimit() {
  const elapsed = Date.now() - lastRequestAt;
  const remaining = MIN_REQUEST_INTERVAL_MS - elapsed;

  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  lastRequestAt = Date.now();
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<PlaceInformation | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const cacheKey = createCacheKey(latitude, longitude);
  const cached = placeCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const request = geocodeQueue.then(async () => {
    const cachedAfterWaiting = placeCache.get(cacheKey);

    if (
      cachedAfterWaiting &&
      cachedAfterWaiting.expiresAt > Date.now()
    ) {
      return cachedAfterWaiting.value;
    }

    await waitForRateLimit();

    const url = new URL(`${NOMINATIM_URL}/reverse`);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Reverse geocoding failed with status ${response.status}`
      );
    }

    const data = (await response.json()) as NominatimResponse;
    const fullAddress = data.display_name || "Unknown location";
    const address = data.address || {};

    const value: PlaceInformation = {
      placeName: createPlaceName(address, fullAddress),
      fullAddress,
      latitude,
      longitude,
    };

    placeCache.set(cacheKey, {
      value,
      expiresAt: Date.now() + CACHE_DURATION_MS,
    });

    return value;
  });

  geocodeQueue = request.then(
    () => undefined,
    () => undefined
  );

  try {
    return await request;
  } catch (error) {
    console.log("[GEOCODER] Reverse geocoding failed", {
      latitude,
      longitude,
      message:
        error instanceof Error
          ? error.message
          : "Unknown geocoding error",
    });

    return null;
  }
}
