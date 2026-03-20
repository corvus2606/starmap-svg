# starmap-svg
for generating svg starmaps from selected coordinates and time 

## Requirements 
- Python 3.10+
- pip

## Install dependencies from file:
	python -m pip install -r requirements.txt

## If needed, install directly:
	python -m pip install svgwrite timezonefinder geopy tzdata

## Usage

	python .\starmap.py -h

	Optional Arguments:
		-h, --help				Show help and exit.
		-coord COORD, --coord COORD				  
								Coordinates in format `lat,lon` (example: `60.186,24.959`).
		-time TIME, --time TIME
								time in format hour.minute.second
		-date DATE, --date DATE
	                        date in format day.month.year
		-utc [UTC], --utc [UTC]
	                        utc of your location -12 to +12 (Auto-detected if ommitted)
	  	-magn [MAGN], --magn [MAGN]
	                        magnitude limit 0.1-12.0
	  	-summertime [SUMMERTIME], --summertime [SUMMERTIME]
	                        if it is summertime on the date of the starchart (Auto-detected if ommitted)
	  	-guides [GUIDES], --guides [GUIDES]
	                        draw guides True/False
	  	-constellation [CONSTELLATION], --constellation [CONSTELLATION]
	                        show constellation True/False
	  	-o OUTPUT, --output OUTPUT
	                        output filename.svg
	  	-width [WIDTH], --width [WIDTH]
	                        width in mm
	  	-height [HEIGHT], --height [HEIGHT]
	                        height in mm
	  	-info INFO, --info INFO
	                        Info text example eame of the place (Auto-detected if ommitted)
		-no-info, --no-info
							disable printing the bottom-left info text block
		-light, --light
							use light color scheme (white background, black stars)

## Example 1
	python starmap.py -coord 60.186,24.959 -time 12.00.00 -date 01.01.2000 -constellation True -light

![image](example/starmap.svg)

## Example 2
	python starmap.py -coord 35.684,139.728 -time 20.00.00 -date 15.07.2018 -guides True -magn 10.0 -width 150 -height 220

![image](example/starmap2.svg)

## Example 3
	python starmap.py -coord 35.684,139.728 -time 20.00.00 -date 15.07.2018 -info Tokyo -guides True -magn 10.0 -width 150 -height 220

![image](example/starmap3.svg)

## Info

Stars data: "Yale Bright Star Catalog ver5"
http://tdc-www.harvard.edu/catalogs/bsc5.html

## TODO
	Planets and Moon orbits.
