# starmap-svg
for generating svg starmaps from selected coordinates and time 

## Requirements 
	Python 3.10+
	svgwrite
	timezonefinder
	geopy
	tzdata

## Install dependencies from file:
	python -m pip install -r requirements.txt

## If needed, install directly:
	python -m pip install svgwrite timezonefinder geopy tzdata

## Usage

	python .\starmap.py -h

	Optional Arguments:
		-h, --help            show this help message and exit
		-coord, --coord COORD
								coordinates in format northern,eastern
		-time, --time TIME    time in format hour.minute.second
		-date, --date DATE    date in format day.month.year
		-utc, --utc UTC       utc of your location (auto if omitted)
		-magn, --magn [MAGN]  magnitude limit 0.1-12.0
		-summertime, --summertime [SUMMERTIME]
								force summertime True/False; omit to auto-detect from date/time/coord
		-guides, --guides [GUIDES]
								draw guides True/False
		-constellation, --constellation [CONSTELLATION]
								show constellation True/False
		-o, --output OUTPUT   output filename.svg
		-width, --width [WIDTH]
								width in mm
		-height, --height [HEIGHT]
								height in mm
		-info, --info INFO    Info text example name of the place
		-no-info, --no-info   disable printing info text block
		-fullview, --fullview [FULLVIEW]
								show stars in full square
		-aperture, --aperture [APERTURE]
								aperture for star size (default 0.4, bigger = bigger starbursts)
		-light, --light       use light color scheme (white background, black stars)

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
