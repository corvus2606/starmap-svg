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

```python .\starmap.py -h```

### Arguments

- `-h, --help`  
  Show help and exit.

- `-coord COORD, --coord COORD`  
  Coordinates in format `lat,lon` (example: `60.186,24.959`).

- `-time TIME, --time TIME`  
  Local time in format `HH.MM.SS`.

- `-date DATE, --date DATE`  
  Date in format `DD.MM.YYYY`.

- `-utc [UTC], --utc [UTC]`  
  UTC base offset for location (auto-detected if omitted).

- `-summertime [SUMMERTIME], --summertime [SUMMERTIME]`  
  DST/summertime override (`true/false`).  
  If omitted, it is auto-detected from date/time/location when possible.

- `-magn [MAGN], --magn [MAGN]`  
  Magnitude limit (example range: `0.1` to `12.0`) bigger number means more stars.

- `-guides [GUIDES], --guides [GUIDES]`  
  Draw guides (`true/false`).

- `-constellation [CONSTELLATION], --constellation [CONSTELLATION]`  
  Show constellation lines (`true/false`).

- `-fullview [FULLVIEW], --fullview [FULLVIEW]`  
  Show stars in full square (`true/false`).

- `-o OUTPUT, --output OUTPUT`  
  Output filename (example: `starmap.svg`).

- `-width [WIDTH], --width [WIDTH]`  
  Output width in mm.

- `-height [HEIGHT], --height [HEIGHT]`  
  Output height in mm.

- `-info INFO, --info INFO`  
  Custom info text in the bottom-left corner.  
  If omitted, city name can be auto-resolved from coordinates.

- `--no-info`  
  Disable printing the bottom-left info text block.

## Example 1
	python starmap.py -coord 60.186,24.959 -time 12.00.00 -date 01.01.2000 -constellation True -light

![image](example/starmap.svg)

## Example 2
	python starmap.py -coord 35.684,139.728 -time 20.00.00 -date 15.07.2018 -guides True -magn 10.0 -width 150 -height 220

![image](example/starmap2.svg)


## Info

Stars data: "Yale Bright Star Catalog ver5"
http://tdc-www.harvard.edu/catalogs/bsc5.html

## TODO
	Planets and Moon orbits.
