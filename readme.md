#AppTiming
###A simple operation timing api with basic monitoring UI

##API Usage
----
1. **POST  /api/v1/track/[unitname]**
Begins timing the operation specified in *unitname*. Returns a tracking key.
2. **POST /api/v1/time[key or unitname]** Ends operation tracking, returning its key, start and end time and duration in milliseconds

##UI Usage
----
Index page displays all units. Click on a unit to display all timings