# Data Dictionary MVP v0.1

Core tables:
- Farmers
- Plots
- Measurements
- Recommendations
- Settings

Required every measurement:
1. plot_id / plot setup fields
2. crop_stage
3. soil_depth
4. water_source
5. recent_event
6. ph_water
7. ec_water
8. ph_soil_fw
9. ec_soil_fw

Calculated fields:
- delta_ph = ph_soil_fw - ph_water
- delta_ec = ec_soil_fw - ec_water

This system reports pH_soil_FW and EC_soil_FW as field-water index values. It does not convert them to pHCaCl2, pHDI, or ECe.
