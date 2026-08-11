import os
import math
import sqlite3
import requests

from datetime import datetime

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    session,
    redirect,
    url_for
)


# ============================================================
# FLASK CONFIGURATION
# ============================================================

app = Flask(__name__)

app.secret_key = os.environ.get(
    "SHESecure_SECRET_KEY",
    "shesecure-development-secret"
)

BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

DATABASE = os.path.join(
    BASE_DIR,
    "shesecure.db"
)


# ============================================================
# EXTERNAL SERVICES
# ============================================================

NOMINATIM_URL = (
    "https://nominatim.openstreetmap.org"
)

OSRM_URL = (
    "https://router.project-osrm.org"
)

HEADERS = {
    "User-Agent":
        "SheSecure-AI-SIH-Project/1.0"
}


# ============================================================
# DATABASE
# ============================================================

def get_db():

    connection = sqlite3.connect(
        DATABASE
    )

    connection.row_factory = sqlite3.Row

    return connection


def initialize_database():

    db = get_db()

    db.executescript(
        """

        CREATE TABLE IF NOT EXISTS users (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL,

            phone TEXT,

            created_at TEXT NOT NULL

        );


        CREATE TABLE IF NOT EXISTS contacts (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER NOT NULL,

            name TEXT NOT NULL,

            phone TEXT NOT NULL,

            created_at TEXT NOT NULL

        );


        CREATE TABLE IF NOT EXISTS incidents (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER,

            place_name TEXT NOT NULL,

            latitude REAL NOT NULL,

            longitude REAL NOT NULL,

            incident_type TEXT NOT NULL,

            severity INTEGER NOT NULL,

            created_at TEXT NOT NULL

        );


        CREATE TABLE IF NOT EXISTS sos_events (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id INTEGER,

            place_name TEXT NOT NULL,

            latitude REAL NOT NULL,

            longitude REAL NOT NULL,

            status TEXT NOT NULL,

            created_at TEXT NOT NULL

        );

        """
    )

    db.commit()

    db.close()


initialize_database()


# ============================================================
# LOGIN HELPER
# ============================================================

def logged_in():

    return (
        "user_id"
        in session
    )


def current_user_id():

    return session.get(
        "user_id"
    )


# ============================================================
# HOME
# ============================================================

@app.get("/")
def index():

    return render_template(
        "index.html"
    )


# ============================================================
# LOGIN
# ============================================================

@app.post("/api/login")
def login():

    data = request.get_json(
        silent=True
    ) or {}

    name = str(
        data.get(
            "name",
            ""
        )
    ).strip()

    phone = str(
        data.get(
            "phone",
            ""
        )
    ).strip()

    if not name:

        return jsonify({

            "ok": False,

            "error":
                "Please enter your name."

        }), 400


    db = get_db()

    cursor = db.execute(

        """
        INSERT INTO users
        (
            name,
            phone,
            created_at
        )
        VALUES (?, ?, ?)
        """,

        (
            name,
            phone,
            datetime.now().isoformat(
                timespec="seconds"
            )
        )

    )

    user_id = cursor.lastrowid

    db.commit()

    db.close()


    session["user_id"] = user_id

    session["user_name"] = name

    session["phone"] = phone


    return jsonify({

        "ok": True,

        "name": name

    })


# ============================================================
# LOGOUT
# ============================================================

@app.get("/api/logout")
def logout():

    session.clear()

    return jsonify({

        "ok": True

    })


# ============================================================
# REVERSE GEOCODING
# ============================================================

@app.get("/api/reverse-geocode")
def reverse_geocode():

    if not logged_in():

        return jsonify({

            "ok": False,

            "error":
                "Please login first."

        }), 401


    try:

        latitude = float(
            request.args[
                "lat"
            ]
        )

        longitude = float(
            request.args[
                "lon"
            ]
        )

    except (
        KeyError,
        ValueError
    ):

        return jsonify({

            "ok": False,

            "error":
                "Invalid location."

        }), 400


    try:

        response = requests.get(

            f"{NOMINATIM_URL}/reverse",

            params={

                "lat":
                    latitude,

                "lon":
                    longitude,

                "format":
                    "json",

                "zoom":
                    18,

                "addressdetails":
                    1

            },

            headers=HEADERS,

            timeout=15

        )

        response.raise_for_status()

        data = response.json()

        address = data.get(
            "address",
            {}
        )


        parts = []

        for key in [

            "road",

            "neighbourhood",

            "suburb",

            "city",

            "town",

            "village",

            "district",

            "state"

        ]:

            value = address.get(
                key
            )

            if (
                value
                and
                value not in parts
            ):

                parts.append(
                    value
                )


        if parts:

            name = ", ".join(
                parts[:4]
            )

        else:

            name = data.get(
                "display_name",
                "Current Location"
            )


        return jsonify({

            "ok": True,

            "name": name

        })


    except Exception:

        return jsonify({

            "ok": False,

            "error":
                "Unable to identify location."

        }), 502


# ============================================================
# SEARCH DESTINATION USING OPENSTREETMAP
# ============================================================

@app.get("/api/search-place")
def search_place():

    if not logged_in():

        return jsonify({

            "ok": False,

            "error":
                "Please login first."

        }), 401


    query = request.args.get(
        "q",
        ""
    ).strip()


    if not query:

        return jsonify({

            "ok": False,

            "error":
                "Enter a destination."

        }), 400


    try:

        response = requests.get(

            f"{NOMINATIM_URL}/search",

            params={

                "q":
                    query,

                "format":
                    "json",

                "limit":
                    1,

                "addressdetails":
                    1

            },

            headers=HEADERS,

            timeout=15

        )

        response.raise_for_status()

        results = response.json()


        if not results:

            return jsonify({

                "ok": False,

                "error":
                    "Destination not found."

            }), 404


        result = results[0]


        return jsonify({

            "ok": True,

            "name":
                result.get(
                    "display_name",
                    query
                ),

            "latitude":
                float(
                    result["lat"]
                ),

            "longitude":
                float(
                    result["lon"]
                )

        })


    except Exception:

        return jsonify({

            "ok": False,

            "error":
                "Destination search failed."

        }), 502


# ============================================================
# HAVERSINE DISTANCE
# ============================================================

def haversine_km(
    lat1,
    lon1,
    lat2,
    lon2
):

    radius = 6371.0

    p1 = math.radians(
        lat1
    )

    p2 = math.radians(
        lat2
    )

    delta_lat = math.radians(
        lat2 - lat1
    )

    delta_lon = math.radians(
        lon2 - lon1
    )

    a = (

        math.sin(
            delta_lat / 2
        ) ** 2

        +

        math.cos(p1)
        *
        math.cos(p2)
        *
        math.sin(
            delta_lon / 2
        ) ** 2

    )

    return (

        radius
        *
        2
        *
        math.atan2(
            math.sqrt(a),
            math.sqrt(1 - a)
        )

    )


# ============================================================
# GET INCIDENTS
# ============================================================

def get_incidents():

    db = get_db()

    rows = db.execute(

        """
        SELECT
            id,
            user_id,
            place_name,
            latitude,
            longitude,
            incident_type,
            severity,
            created_at

        FROM incidents

        ORDER BY id DESC
        """

    ).fetchall()

    db.close()

    return rows


# ============================================================
# SAFETY RISK CALCULATION
# ============================================================

def calculate_risk(
    route,
    incidents,
    travel_hour
):

    risk = 10.0


    # NIGHT RISK

    if (
        travel_hour >= 22
        or
        travel_hour <= 5
    ):

        risk += 30

    elif travel_hour >= 19:

        risk += 15

    elif travel_hour <= 7:

        risk += 8


    # ROUTE COORDINATES

    coordinates = (

        route
        .get(
            "geometry",
            {}
        )
        .get(
            "coordinates",
            []
        )

    )


    if len(coordinates) > 80:

        step = (
            len(coordinates)
            // 80
        )

    else:

        step = 1


    sampled_points = (
        coordinates[::step]
    )


    nearby_incidents = 0


    for incident in incidents:

        for point in sampled_points:

            if len(point) < 2:

                continue


            route_lon = point[0]

            route_lat = point[1]


            distance = haversine_km(

                incident["latitude"],

                incident["longitude"],

                route_lat,

                route_lon

            )


            if distance <= 0.30:

                nearby_incidents += 1

                risk += (
                    incident["severity"]
                    * 2
                )

                break


    risk = min(
        100,
        max(0, risk)
    )


    if risk < 30:

        level = "LOW"

    elif risk < 55:

        level = "MODERATE"

    elif risk < 75:

        level = "HIGH"

    else:

        level = "CRITICAL"


    return (
        round(
            risk,
            1
        ),
        level,
        nearby_incidents
    )


# ============================================================
# FORMAT TRAVEL TIME
# ============================================================

def format_duration(
    seconds
):

    seconds = int(
        round(seconds)
    )


    hours = (
        seconds // 3600
    )

    remaining = (
        seconds % 3600
    )

    minutes = (
        remaining // 60
    )

    seconds = (
        remaining % 60
    )


    if hours > 0:

        return (
            f"{hours} h "
            f"{minutes} min"
        )


    if minutes > 0:

        return (
            f"{minutes} min "
            f"{seconds} sec"
        )


    return (
        f"{seconds} sec"
    )


# ============================================================
# SAFE ROUTE API
# ============================================================

@app.post("/api/routes")
def calculate_routes():

    if not logged_in():

        return jsonify({

            "ok": False,

            "error":
                "Please login first."

        }), 401


    data = request.get_json(
        silent=True
    ) or {}


    try:

        start_lat = float(
            data["latitude"]
        )

        start_lon = float(
            data["longitude"]
        )

        destination = str(
            data["destination"]
        ).strip()

        vehicle = str(
            data.get(
                "vehicle",
                "Car 🚗"
            )
        )

        hours = int(
            data.get(
                "hours",
                0
            )
        )

        minutes = int(
            data.get(
                "minutes",
                0
            )
        )

        seconds = int(
            data.get(
                "seconds",
                0
            )
        )

    except (
        KeyError,
        ValueError,
        TypeError
    ):

        return jsonify({

            "ok": False,

            "error":
                "Invalid route details."

        }), 400


    if not destination:

        return jsonify({

            "ok": False,

            "error":
                "Please enter a destination."

        }), 400


    # DESTINATION SEARCH

    try:

        destination_response = requests.get(

            f"{NOMINATIM_URL}/search",

            params={

                "q":
                    destination,

                "format":
                    "json",

                "limit":
                    1

            },

            headers=HEADERS,

            timeout=15

        )

        destination_response.raise_for_status()

        places = (
            destination_response.json()
        )


        if not places:

            return jsonify({

                "ok": False,

                "error":
                    "Destination not found."

            }), 404


        destination_lat = float(
            places[0]["lat"]
        )

        destination_lon = float(
            places[0]["lon"]
        )

        destination_name = (
            places[0].get(
                "display_name",
                destination
            )
        )


        # OSRM

        coordinates = (

            f"{start_lon},"
            f"{start_lat};"
            f"{destination_lon},"
            f"{destination_lat}"

        )


        response = requests.get(

            f"{OSRM_URL}/route/v1/driving/"
            f"{coordinates}",

            params={

                "alternatives":
                    "true",

                "steps":
                    "true",

                "geometries":
                    "geojson",

                "overview":
                    "full"

            },

            timeout=30

        )

        response.raise_for_status()

        route_data = response.json()


        if route_data.get(
            "code"
        ) != "Ok":

            return jsonify({

                "ok": False,

                "error":
                    "No route found."

            }), 404


        incidents = get_incidents()


        travel_hour = (
            hours % 24
        )


        routes = []


        for index, route in enumerate(

            route_data.get(
                "routes",
                []
            ),

            start=1

        ):

            risk, level, nearby = (
                calculate_risk(

                    route,

                    incidents,

                    travel_hour

                )
            )


            routes.append({

                "route_number":
                    index,

                "distance":
                    round(
                        route["distance"]
                        / 1000,
                        2
                    ),

                "duration":
                    format_duration(
                        route["duration"]
                    ),

                "duration_seconds":
                    int(
                        route["duration"]
                    ),

                "risk_score":
                    risk,

                "risk_level":
                    level,

                "nearby_incidents":
                    nearby,

                "geometry":
                    route.get(
                        "geometry",
                        {}
                    )

            })


        # SAFEST FIRST

        routes.sort(

            key=lambda item:
                item["risk_score"]

        )


        return jsonify({

            "ok": True,

            "destination":
                destination_name,

            "destination_lat":
                destination_lat,

            "destination_lon":
                destination_lon,

            "vehicle":
                vehicle,

            "planned_time": {

                "hours":
                    hours,

                "minutes":
                    minutes,

                "seconds":
                    seconds

            },

            "routes":
                routes

        })


    except requests.RequestException:

        return jsonify({

            "ok": False,

            "error":
                "Map or routing service is unavailable."

        }), 502


    except Exception as error:

        return jsonify({

            "ok": False,

            "error":
                str(error)

        }), 500


# ============================================================
# TRUSTED CONTACTS
# ============================================================

@app.get("/api/contacts")
def get_contacts():

    if not logged_in():

        return jsonify({

            "ok": False,

            "error":
                "Please login first."

        }), 401


    db = get_db()

    rows = db.execute(

        """
        SELECT
            id,
            name,
            phone

        FROM contacts

        WHERE user_id = ?

        ORDER BY id DESC
        """,

        (
            current_user_id(),
        )

    ).fetchall()

    db.close()


    return jsonify({

        "ok": True,

        "contacts": [

            dict(row)

            for row in rows

        ]

    })


# ============================================================
# ADD CONTACT
# ============================================================

@app.post("/api/contacts")
def add_contact():

    if not logged_in():

        return jsonify({

            "ok": False,

            "error":
                "Please login first."

        }), 401


    data = request.get_json(
        silent=True
    ) or {}


    name = str(
        data.get(
            "name",
            ""
        )
    ).strip()


    phone = str(
        data.get(
            "phone",
            ""
        )
    ).strip()


    if not name or not phone:

        return jsonify({

            "ok": False,

            "error":
                "Contact name and phone are required."

        }), 400


    db = get_db()

    db.execute(

        """
        INSERT INTO contacts
        (
            user_id,
            name,
            phone,
            created_at
        )

        VALUES (?, ?, ?, ?)
        """,

        (

            current_user_id(),

            name,

            phone,

            datetime.now().isoformat(
                timespec="seconds"
            )

        )

    )

    db.commit()

    db.close()


    return jsonify({

        "ok": True

    })


# ============================================================
# DELETE CONTACT
# ============================================================

@app.delete(
    "/api/contacts/<int:contact_id>"
)
def delete_contact(
    contact_id
):

    if not logged_in():

        return jsonify({

            "ok": False,

            "error":
                "Please login first."

        }), 401


    db = get_db()

    db.execute(

        """
        DELETE FROM contacts

        WHERE
            id = ?
            AND
            user_id = ?
        """,

        (

            contact_id,

            current_user_id()

        )

    )

    db.commit()

    db.close()


    return jsonify({

        "ok": True

    })


# ============================================================
# SOS
# ============================================================

@app.post("/api/sos")
def activate_sos():

    if not logged_in():

        return jsonify({

            "ok": False,

            "error":
                "Please login first."

        }), 401


    data = request.get_json(
        silent=True
    ) or {}


    try:

        latitude = float(
            data["latitude"]
        )

        longitude = float(
            data["longitude"]
        )

        place_name = str(
            data.get(
                "place_name",
                "Current Location"
            )
        )

    except (
        KeyError,
        ValueError,
        TypeError
    ):

        return jsonify({

            "ok": False,

            "error":
                "Current location is required."

        }), 400


    db = get_db()

    db.execute(

        """
        INSERT INTO sos_events
        (
            user_id,
            place_name,
            latitude,
            longitude,
            status,
            created_at
        )

        VALUES (?, ?, ?, ?, ?, ?)
        """,

        (

            current_user_id(),

            place_name,

            latitude,

            longitude,

            "ACTIVE",

            datetime.now().isoformat(
                timespec="seconds"
            )

        )

    )

    db.commit()

    db.close()


    map_url = (

        "https://www.openstreetmap.org/"
        f"?mlat={latitude}"
        f"&mlon={longitude}"
        f"#map=18/"
        f"{latitude}/"
        f"{longitude}"

    )


    message = (

        "🛡️ SheSecure-AI Safety Alert\n\n"

        f"📍 Current location: "
        f"{place_name}\n\n"

        "I am sharing my current location "
        "for safety.\n\n"

        f"🗺️ Location:\n"
        f"{map_url}"

    )


    return jsonify({

        "ok": True,

        "message":
            message

    })


# ============================================================
# REPORT INCIDENT
# ============================================================

@app.post("/api/incidents")
def report_incident():

    if not logged_in():

        return jsonify({

            "ok": False,

            "error":
                "Please login first."

        }), 401


    data = request.get_json(
        silent=True
    ) or {}


    try:

        latitude = float(
            data["latitude"]
        )

        longitude = float(
            data["longitude"]
        )

        place_name = str(
            data["place_name"]
        )

        incident_type = str(
            data["incident_type"]
        )

        severity = int(
            data["severity"]
        )

    except (
        KeyError,
        ValueError,
        TypeError
    ):

        return jsonify({

            "ok": False,

            "error":
                "Invalid incident data."

        }), 400


    severity = max(
        1,
        min(
            10,
            severity
        )
    )


    db = get_db()

    db.execute(

        """
        INSERT INTO incidents
        (
            user_id,
            place_name,
            latitude,
            longitude,
            incident_type,
            severity,
            created_at
        )

        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,

        (

            current_user_id(),

            place_name,

            latitude,

            longitude,

            incident_type,

            severity,

            datetime.now().isoformat(
                timespec="seconds"
            )

        )

    )

    db.commit()

    db.close()


    return jsonify({

        "ok": True

    })


# ============================================================
# ANALYTICS
# ============================================================

@app.get("/api/analytics")
def analytics():

    if not logged_in():

        return jsonify({

            "ok": False,

            "error":
                "Please login first."

        }), 401


    incidents = get_incidents()


    total = len(
        incidents
    )


    average = (

        round(

            sum(
                row["severity"]
                for row in incidents
            )
            / total,

            1

        )

        if total

        else 0

    )


    high = sum(

        1

        for row in incidents

        if row["severity"] >= 7

    )


    location_counts = {}


    for row in incidents:

        location = (
            row["place_name"]
        )

        location_counts[
            location
        ] = (

            location_counts.get(
                location,
                0
            )
            + 1

        )


    return jsonify({

        "ok": True,

        "total":
            total,

        "average_severity":
            average,

        "high_severity":
            high,

        "locations": [

            {

                "place":
                    place,

                "incidents":
                    count

            }

            for place, count

            in sorted(

                location_counts.items(),

                key=lambda item:
                    item[1],

                reverse=True

            )

        ],

        "incidents": [

            {

                "place":
                    row["place_name"],

                "type":
                    row["incident_type"],

                "severity":
                    row["severity"],

                "created_at":
                    row["created_at"]

            }

            for row in incidents

        ]

    })


# ============================================================
# LOCAL QWEN AI ASSISTANT
# ============================================================

@app.post("/api/assistant")
def assistant():

    if not logged_in():

        return jsonify({

            "ok": False,

            "error":
                "Please login first."

        }), 401


    data = request.get_json(
        silent=True
    ) or {}


    question = str(
        data.get(
            "question",
            ""
        )
    ).strip()


    location_name = str(

        data.get(

            "location_name",

            "Current location"

        )

    )


    if not question:

        return jsonify({

            "ok": False,

            "error":
                "Please provide a question."

        }), 400


    system_prompt = f"""

You are SheSecure AI,
an intelligent women-safety assistant.

Current user area:

{location_name}

Help the user with:

- personal safety
- safer travel
- route decisions
- safety analytics
- SOS guidance
- emergency preparation
- SheSecure-AI features

Rules:

1. Never guarantee that a place or route
   is completely safe.

2. Never claim someone is dangerous
   based only on appearance or proximity.

3. Never claim that police were contacted
   unless an authorized integration actually
   performed that action.

4. Treat safety scores as estimates.

5. If the user is in immediate danger,
   recommend contacting appropriate
   emergency services.

6. Keep answers concise and easy to understand.

7. Never expose Python code or internal
   implementation details.

User question:

{question}

"""


    try:

        response = requests.post(

            "http://127.0.0.1:11434/api/chat",

            json={

                "model":
                    "qwen2.5:1.5b",

                "messages": [

                    {

                        "role":
                            "system",

                        "content":
                            system_prompt

                    }

                ],

                "stream":
                    False

            },

            timeout=120

        )


        response.raise_for_status()


        result = response.json()


        answer = (

            result

            .get(
                "message",
                {}
            )

            .get(
                "content",
                ""
            )

            .strip()

        )


        if not answer:

            return jsonify({

                "ok": False,

                "error":
                    "Qwen returned an empty response."

            }), 502


        return jsonify({

            "ok": True,

            "answer":
                answer

        })


    except requests.RequestException:

        return jsonify({

            "ok": False,

            "error": (

                "Cannot connect to local Ollama. "
                "Make sure Ollama is running and "
                "qwen2.5:1.5b is installed."

            )

        }), 503


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False,
        use_reloader=False
    )