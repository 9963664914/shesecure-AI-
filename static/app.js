// ============================================================
// SHESecure-AI FRONTEND
// ============================================================


// ============================================================
// GLOBAL STATE
// ============================================================

let currentLocation = null;

let currentLocationName =
    "Current location unavailable";

let homeMap = null;

let routeMap = null;

let currentMarker = null;

let recognition = null;


// ============================================================
// DOM HELPERS
// ============================================================

function element(id) {

    return document.getElementById(id);

}


function show(id) {

    const item = element(id);

    if (item) {

        item.classList.remove(
            "hidden"
        );

    }

}


function hide(id) {

    const item = element(id);

    if (item) {

        item.classList.add(
            "hidden"
        );

    }

}


// ============================================================
// API HELPER
// ============================================================

async function api(
    url,
    options = {}
) {

    const response =
        await fetch(
            url,
            {
                ...options,
                headers: {
                    "Content-Type":
                        "application/json",
                    ...(options.headers || {})
                }
            }
        );


    const data =
        await response.json();


    if (!response.ok) {

        throw new Error(
            data.error ||
            "Request failed"
        );

    }


    return data;

}


// ============================================================
// LOGIN
// ============================================================

element(
    "loginButton"
).addEventListener(
    "click",
    async function () {

        const name =
            element(
                "loginName"
            ).value.trim();


        const phone =
            element(
                "loginPhone"
            ).value.trim();


        if (!name) {

            element(
                "loginError"
            ).textContent =
                "Please enter your name.";

            return;

        }


        try {

            const result =
                await api(
                    "/api/login",
                    {
                        method: "POST",

                        body:
                            JSON.stringify({
                                name,
                                phone
                            })
                    }
                );


            if (result.ok) {

                hide(
                    "loginPage"
                );

                show(
                    "application"
                );


                element(
                    "sidebarUser"
                ).textContent =
                    result.name;


                startLocationTracking();

                initializeHomeMap();

            }

        }
        catch (error) {

            element(
                "loginError"
            ).textContent =
                error.message;

        }

    }
);


// ============================================================
// NAVIGATION
// ============================================================

document
    .querySelectorAll(
        ".nav-button, .voice-nav-button"
    )
    .forEach(
        button => {

            button.addEventListener(
                "click",
                function () {

                    const page =
                        this.dataset.page;

                    openPage(
                        page
                    );

                }

            );

        }
    );


function openPage(page) {

    const pages = [

        "home",

        "route",

        "sos",

        "analytics",

        "assistant"

    ];


    pages.forEach(
        item => {

            hide(
                item + "Page"
            );

        }
    );


    show(
        page + "Page"
    );


    document
        .querySelectorAll(
            ".nav-button"
        )
        .forEach(
            button => {

                button.classList.remove(
                    "active"
                );


                if (
                    button.dataset.page
                    ===
                    page
                ) {

                    button.classList.add(
                        "active"
                    );

                }

            }
        );


    if (
        page === "home"
    ) {

        setTimeout(
            initializeHomeMap,
            100
        );

    }


    if (
        page === "sos"
    ) {

        loadContacts();

    }


    if (
        page === "analytics"
    ) {

        loadAnalytics();

    }


    if (
        page === "assistant"
    ) {

        element(
            "assistantLocation"
        ).textContent =
            currentLocationName;

    }

}


// ============================================================
// LOGOUT
// ============================================================

element(
    "logoutButton"
).addEventListener(
    "click",
    async function () {

        await fetch(
            "/api/logout"
        );

        location.reload();

    }
);


// ============================================================
// CURRENT LOCATION
// ============================================================

function startLocationTracking() {

    if (
        !navigator.geolocation
    ) {

        updateLocationUI(
            "Geolocation is not supported."
        );

        return;

    }


    navigator.geolocation.watchPosition(

        async function (
            position
        ) {

            const latitude =
                position.coords.latitude;

            const longitude =
                position.coords.longitude;


            currentLocation = {

                latitude,

                longitude

            };


            try {

                const result =
                    await fetch(

                        `/api/reverse-geocode?lat=${latitude}&lon=${longitude}`

                    );


                const data =
                    await result.json();


                if (data.ok) {

                    currentLocationName =
                        data.name;

                }

            }
            catch (error) {

                currentLocationName =
                    "Current Location";

            }


            updateLocationUI(
                currentLocationName
            );


            updateHomeMap();

        },

        function (error) {

            updateLocationUI(
                "Location permission required"
            );

        },

        {

            enableHighAccuracy:
                true,

            maximumAge:
                10000,

            timeout:
                15000

        }

    );

}


// ============================================================
// UPDATE LOCATION UI
// ============================================================

function updateLocationUI(
    name
) {

    const ids = [

        "currentLocationName",

        "routeStartLocation",

        "sosLocation",

        "assistantLocation"

    ];


    ids.forEach(
        id => {

            const item =
                element(id);

            if (item) {

                item.textContent =
                    name;

            }

        }
    );

}


// ============================================================
// HOME MAP
// ============================================================

function initializeHomeMap() {

    if (
        homeMap
    ) {

        updateHomeMap();

        return;

    }


    const defaultLocation = [

        16.5062,

        80.6480

    ];


    homeMap =
        L.map(
            "homeMap"
        ).setView(
            defaultLocation,
            13
        );


    L.tileLayer(

        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

        {

            attribution:
                "&copy; OpenStreetMap contributors"

        }

    ).addTo(
        homeMap
    );


    updateHomeMap();

}


// ============================================================
// UPDATE HOME MAP
// ============================================================

function updateHomeMap() {

    if (
        !homeMap
        ||
        !currentLocation
    ) {

        return;

    }


    const position = [

        currentLocation.latitude,

        currentLocation.longitude

    ];


    homeMap.setView(
        position,
        16
    );


    if (
        currentMarker
    ) {

        currentMarker.remove();

    }


    currentMarker =
        L.marker(
            position
        )
        .addTo(
            homeMap
        )
        .bindPopup(
            "📍 You are here"
        )
        .openPopup();

}


// ============================================================
// ROUTE CALCULATION
// ============================================================

element(
    "routeButton"
).addEventListener(
    "click",
    async function () {

        const error =
            element(
                "routeError"
            );


        error.textContent = "";


        if (
            !currentLocation
        ) {

            error.textContent =
                "Please allow current location.";

            return;

        }


        const destination =
            element(
                "destination"
            ).value.trim();


        if (!destination) {

            error.textContent =
                "Please enter a destination.";

            return;

        }


        const vehicle =
            element(
                "vehicle"
            ).value;


        const hours =
            Number(
                element(
                    "travelHours"
                ).value
            );


        const minutes =
            Number(
                element(
                    "travelMinutes"
                ).value
            );


        const seconds =
            Number(
                element(
                    "travelSeconds"
                ).value
            );


        this.disabled = true;

        this.textContent =
            "🗺️ Finding routes...";


        try {

            const result =
                await api(
                    "/api/routes",
                    {

                        method:
                            "POST",

                        body:
                            JSON.stringify({

                                latitude:
                                    currentLocation.latitude,

                                longitude:
                                    currentLocation.longitude,

                                destination,

                                vehicle,

                                hours,

                                minutes,

                                seconds

                            })

                    }
                );


            displayRoutes(
                result
            );

        }
        catch (routeError) {

            error.textContent =
                routeError.message;

        }
        finally {

            this.disabled = false;

            this.textContent =
                "🛡️ Find Safer Routes";

        }

    }
);


// ============================================================
// DISPLAY ROUTES
// ============================================================

function displayRoutes(
    data
) {

    show(
        "routeResults"
    );


    const safest =
        data.routes[0];


    const recommendation =
        element(
            "recommendedRoute"
        );


    let riskClass = "";


    if (
        safest.risk_score >= 55
    ) {

        riskClass =
            "moderate";

    }


    if (
        safest.risk_score >= 75
    ) {

        riskClass =
            "high";

    }


    recommendation.className =
        `recommendation ${riskClass}`;


    recommendation.innerHTML = `

        <h2>
            🛡️ Recommended Route
        </h2>

        <h3>
            Route ${safest.route_number}
        </h3>

        <p>
            <strong>
                Safety Risk:
            </strong>
            ${safest.risk_score}/100
        </p>

        <p>
            <strong>
                Risk Level:
            </strong>
            ${safest.risk_level}
        </p>

        <p>
            <strong>
                Distance:
            </strong>
            ${safest.distance} km
        </p>

        <p>
            <strong>
                Travel Time:
            </strong>
            ${safest.duration}
        </p>

        <p>
            ⚠️ Safety scores are estimates
            and do not guarantee personal safety.
        </p>

    `;


    // TABLE

    const table =
        document.createElement(
            "table"
        );


    table.innerHTML = `

        <thead>

            <tr>

                <th>Route</th>

                <th>Distance</th>

                <th>Travel Time</th>

                <th>Safety</th>

                <th>Risk</th>

                <th>Nearby Incidents</th>

            </tr>

        </thead>

        <tbody></tbody>

    `;


    const tbody =
        table.querySelector(
            "tbody"
        );


    data.routes.forEach(
        route => {

            const row =
                document.createElement(
                    "tr"
                );


            row.innerHTML = `

                <td>
                    Route ${route.route_number}
                </td>

                <td>
                    ${route.distance} km
                </td>

                <td>
                    ${route.duration}
                </td>

                <td>
                    ${route.risk_score}/100
                </td>

                <td>
                    ${route.risk_level}
                </td>

                <td>
                    ${route.nearby_incidents}
                </td>

            `;


            tbody.appendChild(
                row
            );

        }
    );


    const routeTable =
        element(
            "routeTable"
        );


    routeTable.innerHTML = "";

    routeTable.appendChild(
        table
    );


    drawRouteMap(
        data
    );

}


// ============================================================
// ROUTE MAP
// ============================================================

function drawRouteMap(
    data
) {

    if (
        routeMap
    ) {

        routeMap.remove();

    }


    routeMap =
        L.map(
            "routeMap"
        ).setView(

            [

                currentLocation.latitude,

                currentLocation.longitude

            ],

            14

        );


    L.tileLayer(

        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

        {

            attribution:
                "&copy; OpenStreetMap contributors"

        }

    ).addTo(
        routeMap
    );


    // START

    L.marker(

        [

            currentLocation.latitude,

            currentLocation.longitude

        ]

    )

    .addTo(
        routeMap
    )

    .bindPopup(
        "📍 Your current location"
    );


    // DESTINATION

    L.marker(

        [

            data.destination_lat,

            data.destination_lon

        ]

    )

    .addTo(
        routeMap
    )

    .bindPopup(
        "🏁 " +
        data.destination
    );


    const colors = [

        "#16a34a",

        "#f59e0b",

        "#dc2626",

        "#7c3aed"

    ];


    data.routes.forEach(

        (
            route,
            index
        ) => {


            const coordinates =
                route.geometry.coordinates;


            const points =
                coordinates.map(
                    point => [

                        point[1],

                        point[0]

                    ]
                );


            L.polyline(

                points,

                {

                    color:
                        colors[
                            index
                            % colors.length
                        ],

                    weight:
                        index === 0
                        ? 7
                        : 4,

                    opacity:
                        0.85

                }

            )

            .addTo(
                routeMap
            )

            .bindTooltip(

                `Route ${route.route_number} | Risk ${route.risk_score}/100`

            );

        }

    );


    setTimeout(
        () => {

            routeMap.invalidateSize();

        },

        200

    );

}


// ============================================================
// CONTACTS
// ============================================================

async function loadContacts() {

    try {

        const result =
            await api(
                "/api/contacts"
            );


        const list =
            element(
                "contactsList"
            );


        list.innerHTML = "";


        if (
            result.contacts.length === 0
        ) {

            list.innerHTML =
                "<p>No trusted contacts added yet.</p>";

            return;

        }


        result.contacts.forEach(
            contact => {

                const item =
                    document.createElement(
                        "div"
                    );


                item.className =
                    "contact-item";


                item.innerHTML = `

                    <strong>
                        👤 ${escapeHtml(
                            contact.name
                        )}
                    </strong>

                    <p>
                        ${escapeHtml(
                            contact.phone
                        )}
                    </p>

                    <div
                        class="contact-actions"
                    >

                        <a
                            href="${createWhatsAppUrl(
                                contact.phone
                            )}"
                            target="_blank"
                        >
                            💬 WhatsApp
                        </a>

                        <a
                            href="${createSmsUrl(
                                contact.phone
                            )}"
                        >
                            📱 SMS
                        </a>

                        <button
                            onclick="deleteContact(
                                ${contact.id}
                            )"
                        >
                            🗑️ Remove
                        </button>

                    </div>

                `;


                list.appendChild(
                    item
                );

            }
        );

    }
    catch (error) {

        element(
            "contactsList"
        ).innerHTML =
            `<p class="error-text">
                ${escapeHtml(
                    error.message
                )}
            </p>`;

    }

}


// ============================================================
// ADD CONTACT
// ============================================================

element(
    "addContactButton"
).addEventListener(
    "click",
    async function () {

        const name =
            element(
                "contactName"
            ).value.trim();


        const phone =
            element(
                "contactPhone"
            ).value.trim();


        const error =
            element(
                "contactError"
            );


        error.textContent = "";


        if (
            !name ||
            !phone
        ) {

            error.textContent =
                "Enter contact name and phone.";

            return;

        }


        try {

            await api(
                "/api/contacts",
                {

                    method:
                        "POST",

                    body:
                        JSON.stringify({

                            name,

                            phone

                        })

                }
            );


            element(
                "contactName"
            ).value = "";


            element(
                "contactPhone"
            ).value = "";


            await loadContacts();

        }
        catch (contactError) {

            error.textContent =
                contactError.message;

        }

    }
);


// ============================================================
// DELETE CONTACT
// ============================================================

async function deleteContact(
    id
) {

    if (
        !confirm(
            "Remove this trusted contact?"
        )
    ) {

        return;

    }


    try {

        await fetch(

            `/api/contacts/${id}`,

            {

                method:
                    "DELETE"

            }

        );


        loadContacts();

    }
    catch (error) {

        alert(
            error.message
        );

    }

}


// ============================================================
// WHATSAPP
// ============================================================

function createWhatsAppUrl(
    phone
) {

    if (
        !currentLocation
    ) {

        return "#";

    }


    const message =
        createSafetyMessage();


    return (

        "https://wa.me/"
        +
        phone
            .replace(
                /[^0-9]/g,
                ""
            )
        +
        "?text="
        +
        encodeURIComponent(
            message
        )

    );

}


// ============================================================
// SMS
// ============================================================

function createSmsUrl(
    phone
) {

    const message =
        createSafetyMessage();


    return (

        "sms:"
        +
        phone
        +
        "?body="
        +
        encodeURIComponent(
            message
        )

    );

}


// ============================================================
// SAFETY MESSAGE
// ============================================================

function createSafetyMessage() {

    if (
        !currentLocation
    ) {

        return (
            "SheSecure-AI safety update. "
            +
            "Current location unavailable."
        );

    }


    const mapUrl =

        "https://www.openstreetmap.org/"
        +
        "?mlat="
        +
        currentLocation.latitude
        +
        "&mlon="
        +
        currentLocation.longitude
        +
        "#map=18/"
        +
        currentLocation.latitude
        +
        "/"
        +
        currentLocation.longitude;


    return (

        "🛡️ SheSecure-AI Safety Alert\n\n"
        +
        "📍 Current location: "
        +
        currentLocationName
        +
        "\n\n"
        +
        "I am sharing my current location "
        +
        "for safety.\n\n"
        +
        "🗺️ Location:\n"
        +
        mapUrl

    );

}


// ============================================================
// SOS
// ============================================================

element(
    "sosButton"
).addEventListener(
    "click",
    async function () {

        const message =
            element(
                "sosMessage"
            );


        message.textContent = "";


        if (
            !currentLocation
        ) {

            message.textContent =
                "Current location is unavailable.";

            return;

        }


        this.disabled = true;

        this.textContent =
            "🚨 Activating...";


        try {

            const result =
                await api(
                    "/api/sos",
                    {

                        method:
                            "POST",

                        body:
                            JSON.stringify({

                                latitude:
                                    currentLocation.latitude,

                                longitude:
                                    currentLocation.longitude,

                                place_name:
                                    currentLocationName

                            })

                    }
                );


            message.textContent =
                "SOS recorded. Trusted-contact sharing is ready.";

            await loadContacts();

        }
        catch (error) {

            message.textContent =
                error.message;

        }
        finally {

            this.disabled = false;

            this.textContent =
                "🚨 ACTIVATE SOS";

        }

    }
);


// ============================================================
// ANALYTICS
// ============================================================

async function loadAnalytics() {

    try {

        const data =
            await api(
                "/api/analytics"
            );


        element(
            "totalIncidents"
        ).textContent =
            data.total;


        element(
            "averageSeverity"
        ).textContent =
            data.average_severity
            +
            "/10";


        element(
            "highSeverity"
        ).textContent =
            data.high_severity;


        // INCIDENT TABLE

        const table =
            document.createElement(
                "table"
            );


        table.innerHTML = `

            <thead>

                <tr>

                    <th>📍 Location</th>

                    <th>Incident</th>

                    <th>Severity</th>

                    <th>Reported</th>

                </tr>

            </thead>

            <tbody></tbody>

        `;


        const tbody =
            table.querySelector(
                "tbody"
            );


        data.incidents.forEach(
            incident => {

                const row =
                    document.createElement(
                        "tr"
                    );


                row.innerHTML = `

                    <td>
                        ${escapeHtml(
                            incident.place
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            incident.type
                        )}
                    </td>

                    <td>
                        ${incident.severity}/10
                    </td>

                    <td>
                        ${escapeHtml(
                            incident.created_at
                        )}
                    </td>

                `;


                tbody.appendChild(
                    row
                );

            }
        );


        const incidentTable =
            element(
                "incidentTable"
            );


        incidentTable.innerHTML = "";


        if (
            data.incidents.length
            ===
            0
        ) {

            incidentTable.innerHTML =
                "<p>No incidents reported yet.</p>";

        }
        else {

            incidentTable.appendChild(
                table
            );

        }


        // LOCATION DISTRIBUTION

        const locationDiv =
            element(
                "locationAnalytics"
            );


        locationDiv.innerHTML = "";


        if (
            data.locations.length
            ===
            0
        ) {

            locationDiv.innerHTML =
                "<p>No location data available.</p>";

        }
        else {

            data.locations.forEach(
                location => {

                    const row =
                        document.createElement(
                            "div"
                        );


                    row.className =
                        "contact-item";


                    row.innerHTML = `

                        <strong>
                            📍
                            ${escapeHtml(
                                location.place
                            )}
                        </strong>

                        <p>
                            ${location.incidents}
                            incident(s)
                        </p>

                    `;


                    locationDiv.appendChild(
                        row
                    );

                }
            );

        }

    }
    catch (error) {

        console.error(
            error
        );

    }

}


// ============================================================
// SEVERITY SLIDER
// ============================================================

element(
    "severity"
).addEventListener(
    "input",
    function () {

        element(
            "severityValue"
        ).textContent =
            this.value;

    }
);


// ============================================================
// REPORT INCIDENT
// ============================================================

element(
    "reportButton"
).addEventListener(
    "click",
    async function () {

        const message =
            element(
                "reportMessage"
            );


        if (
            !currentLocation
        ) {

            message.textContent =
                "Current location is unavailable.";

            return;

        }


        try {

            await api(
                "/api/incidents",
                {

                    method:
                        "POST",

                    body:
                        JSON.stringify({

                            latitude:
                                currentLocation.latitude,

                            longitude:
                                currentLocation.longitude,

                            place_name:
                                currentLocationName,

                            incident_type:
                                element(
                                    "incidentType"
                                ).value,

                            severity:
                                Number(
                                    element(
                                        "severity"
                                    ).value
                                )

                        })

                }
            );


            message.textContent =
                "Safety report submitted successfully.";


            loadAnalytics();

        }
        catch (error) {

            message.textContent =
                error.message;

        }

    }
);


// ============================================================
// CHAT MESSAGE
// ============================================================

function addMessage(
    role,
    text
) {

    const container =
        element(
            "chatMessages"
        );


    const message =
        document.createElement(
            "div"
        );


    message.className =
        `message ${role}`;


    message.textContent =
        text;


    container.appendChild(
        message
    );


    container.scrollTop =
        container.scrollHeight;

}


// ============================================================
// ASK AI
// ============================================================

async function askAI(
    question
) {

    question =
        question.trim();


    if (!question) {

        return;

    }


    addMessage(
        "user",
        question
    );


    element(
        "questionInput"
    ).value = "";


    element(
        "voiceStatus"
    ).textContent =
        "Thinking...";


    try {

        const result =
            await api(
                "/api/assistant",
                {

                    method:
                        "POST",

                    body:
                        JSON.stringify({

                            question,

                            location_name:
                                currentLocationName

                        })

                }
            );


        addMessage(
            "assistant",
            result.answer
        );


        // AUTOMATIC VOICE

        speakAnswer(
            result.answer
        );


        element(
            "voiceStatus"
        ).textContent =
            "Ready";

    }
    catch (error) {

        addMessage(
            "assistant",
            "Sorry, I could not connect to SheSecure AI."
        );


        element(
            "voiceStatus"
        ).textContent =
            "AI unavailable";

    }

}


// ============================================================
// SEND BUTTON
// ============================================================

element(
    "sendQuestion"
).addEventListener(
    "click",
    function () {

        askAI(
            element(
                "questionInput"
            ).value
        );

    }
);


// ============================================================
// ENTER KEY
// ============================================================

element(
    "questionInput"
).addEventListener(
    "keydown",
    function (event) {

        if (
            event.key
            ===
            "Enter"
        ) {

            askAI(
                this.value
            );

        }

    }
);


// ============================================================
// SPEECH TO TEXT
// ============================================================

element(
    "micButton"
).addEventListener(
    "click",
    function () {

        startSpeechRecognition();

    }
);


function startSpeechRecognition() {

    const SpeechRecognition =
        window.SpeechRecognition
        ||
        window.webkitSpeechRecognition;


    if (
        !SpeechRecognition
    ) {

        element(
            "voiceStatus"
        ).textContent =
            "Speech recognition is not supported. Use Chrome or Edge.";

        return;

    }


    recognition =
        new SpeechRecognition();


    recognition.lang =
        "en-IN";


    recognition.interimResults =
        false;


    recognition.continuous =
        false;


    recognition.onstart =
        function () {

            element(
                "micButton"
            ).classList.add(
                "listening"
            );


            element(
                "voiceStatus"
            ).textContent =
                "🎤 Listening...";

        };


    recognition.onresult =
        function (
            event
        ) {

            const transcript =
                event
                .results[0][0]
                .transcript;


            element(
                "questionInput"
            ).value =
                transcript;


            askAI(
                transcript
            );

        };


    recognition.onerror =
        function (
            event
        ) {

            element(
                "voiceStatus"
            ).textContent =
                "Voice error: "
                +
                event.error;

        };


    recognition.onend =
        function () {

            element(
                "micButton"
            ).classList.remove(
                "listening"
            );


            if (
                element(
                    "voiceStatus"
                ).textContent
                ===
                "🎤 Listening..."
            ) {

                element(
                    "voiceStatus"
                ).textContent =
                    "Ready";

            }

        };


    recognition.start();

}


// ============================================================
// TEXT TO SPEECH
// ============================================================

function speakAnswer(
    text
) {

    if (
        !(
            "speechSynthesis"
            in
            window
        )
    ) {

        return;

    }


    window
        .speechSynthesis
        .cancel();


    const speech =
        new SpeechSynthesisUtterance(
            text
        );


    speech.lang =
        "en-IN";


    speech.rate =
        0.95;


    speech.pitch =
        1;


    speech.volume =
        1;


    window
        .speechSynthesis
        .speak(
            speech
        );

}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(
    value
) {

    return String(
        value
    )

    .replace(
        /&/g,
        "&amp;"
    )

    .replace(
        /</g,
        "&lt;"
    )

    .replace(
        />/g,
        "&gt;"
    )

    .replace(
        /"/g,
        "&quot;"
    )

    .replace(
        /'/g,
        "&#039;"
    );

}


// ============================================================
// INITIALIZATION
// ============================================================

window.addEventListener(
    "load",
    function () {

        // Login page is visible
        // initially.

    }
);