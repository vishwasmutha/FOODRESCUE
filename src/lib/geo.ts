// Offline demo geocoder: approximate centroids for known localities and cities.
// Straight-line demo data only; replace with a real geocoding provider (MAP_PROVIDER_API_KEY) in production.
const places: Array<[string, number, number, string]> = [
  ["indiranagar", 12.9719, 77.6412, "Bengaluru"],
  ["domlur", 12.9611, 77.6387, "Bengaluru"],
  ["ulsoor", 12.9817, 77.6286, "Bengaluru"],
  ["koramangala", 12.9352, 77.6245, "Bengaluru"],
  ["jayanagar", 12.925, 77.5938, "Bengaluru"],
  ["jp nagar", 12.9063, 77.5857, "Bengaluru"],
  ["whitefield", 12.9698, 77.75, "Bengaluru"],
  ["hsr", 12.9116, 77.6474, "Bengaluru"],
  ["btm", 12.9166, 77.6101, "Bengaluru"],
  ["marathahalli", 12.9591, 77.6974, "Bengaluru"],
  ["malleshwaram", 13.0035, 77.5647, "Bengaluru"],
  ["rajajinagar", 12.9915, 77.5521, "Bengaluru"],
  ["basavanagudi", 12.9416, 77.5754, "Bengaluru"],
  ["shivajinagar", 12.9857, 77.6057, "Bengaluru"],
  ["mg road", 12.9756, 77.6068, "Bengaluru"],
  ["yelahanka", 13.1007, 77.5963, "Bengaluru"],
  ["electronic city", 12.8452, 77.6602, "Bengaluru"],
  ["hebbal", 13.0358, 77.597, "Bengaluru"],
  ["bengaluru", 12.9716, 77.5946, "Bengaluru"],
  ["bangalore", 12.9716, 77.5946, "Bengaluru"],
  ["mumbai", 19.076, 72.8777, "Mumbai"],
  ["delhi", 28.6139, 77.209, "Delhi"],
  ["chennai", 13.0827, 80.2707, "Chennai"],
  ["hyderabad", 17.385, 78.4867, "Hyderabad"],
  ["pune", 18.5204, 73.8567, "Pune"],
  ["kolkata", 22.5726, 88.3639, "Kolkata"],
];

export function approximateLocation(address: string) {
  const text = address.toLowerCase();
  const hit = places.find(([key]) => text.includes(key));
  return hit ? { latitude: hit[1], longitude: hit[2], city: hit[3] } : null;
}
