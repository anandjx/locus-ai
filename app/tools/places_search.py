"""Google Maps Places API search tool for competitor mapping."""

# import os
# from google.adk.tools import ToolContext


# def search_places(query: str, tool_context: ToolContext) -> dict:
#     """Search for places using Google Maps Places API.

#     This tool searches for businesses/places matching the query using the
#     Google Maps Places API. It returns real competitor data including names,
#     addresses, ratings, and other relevant information.

#     Args:
#         query: Search query combining business type and location.
#                Example: "fitness studio near KR Puram, Bangalore, India"

#     Returns:
#         dict: A dictionary containing:
#             - status: "success" or "error"
#             - results: List of places found with details
#             - count: Number of results found
#             - error_message: Error details if status is "error"
#     """
#     try:
#         import googlemaps

#         # Get API key from session state first, then fall back to environment variable
#         maps_api_key = tool_context.state.get("maps_api_key", "") or os.environ.get("MAPS_API_KEY", "")

#         if not maps_api_key:
#             return {
#                 "status": "error",
#                 "error_message": "Maps API key not found. Set MAPS_API_KEY environment variable or 'maps_api_key' in session state.",
#                 "results": [],
#                 "count": 0,
#             }

#         # Initialize Google Maps client
#         gmaps = googlemaps.Client(key=maps_api_key)

#         # Perform places search
#         result = gmaps.places(query)

#         # Extract and format results
#         places = []
#         for place in result.get("results", []):
#             places.append({
#                 "name": place.get("name", "Unknown"),
#                 "address": place.get("formatted_address", place.get("vicinity", "N/A")),
#                 "rating": place.get("rating", 0),
#                 "user_ratings_total": place.get("user_ratings_total", 0),
#                 "price_level": place.get("price_level", "N/A"),
#                 "types": place.get("types", []),
#                 "business_status": place.get("business_status", "UNKNOWN"),
#                 "location": {
#                     "lat": place.get("geometry", {}).get("location", {}).get("lat"),
#                     "lng": place.get("geometry", {}).get("location", {}).get("lng"),
#                 },
#                 "place_id": place.get("place_id", ""),
#             })

#         return {
#             "status": "success",
#             "results": places,
#             "count": len(places),
#             "next_page_token": result.get("next_page_token"),
#         }

#     except Exception as e:
#         return {
#             "status": "error",
#             "error_message": str(e),
#             "results": [],
#             "count": 0,
#         }

import os
import googlemaps
from google.adk.tools import ToolContext

def search_places(target_location: str, business_type: str, radius_meters: int = 5000, tool_context: ToolContext = None) -> dict:
    """SOTA Nearby Search: Geocodes location and finds competitors in a radius.
    
    Args:
        target_location: The area to analyze (e.g., 'Noonmati, Guwahati').
        business_type: The primary industry (e.g., 'gym', 'cafe').
        radius_meters: Search radius (default 5km for urban areas).
    """
    try:
        maps_api_key = tool_context.state.get("maps_api_key", "") or os.environ.get("MAPS_API_KEY", "")
        if not maps_api_key:
            return {"status": "error", "error_message": "Maps API key missing."}

        gmaps = googlemaps.Client(key=maps_api_key)

        # Step 1: Geocode the location to get Lat/Lng coordinates
        geocode_result = gmaps.geocode(target_location)
        if not geocode_result:
            return {"status": "error", "error_message": f"Could not find location: {target_location}"}
        
        location_coords = geocode_result[0]["geometry"]["location"]

        # Step 2: Perform Nearby Search (More accurate than text search)
        # We use 'keyword' to catch relevant businesses by name/description
        result = gmaps.places_nearby(
            location=location_coords,
            radius=radius_meters,
            keyword=business_type
        )

        places = []
        for place in result.get("results", []):
            places.append({
                "name": place.get("name"),
                "address": place.get("vicinity"),
                "rating": place.get("rating", 0),
                "user_ratings_total": place.get("user_ratings_total", 0),
                "business_status": place.get("business_status"),
                "types": place.get("types", [])
            })

        return {
            "status": "success",
            "results": places,
            "count": len(places),
            "center_coords": location_coords
        }

    except Exception as e:
        return {"status": "error", "error_message": str(e)}