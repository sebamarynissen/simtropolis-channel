# API Endpoint

```
https://community.simtropolis.com/stex/files-api.php 
```

Accepts GET requests.

| Parameter | Type | Description | Example |
| --- | --- | --- | --- |
| `key` | Integer | The 16-digit token needed to access the API.  <br>Without this, the request isn't authorized. | `key=0123456789012345` |
| `id` | Integer | Specific file ID to retrieve a single file directly.  <br>If specified, other filters are ignored.  <br>Multiple IDs can be added if separated by commas. | `id=123`<br>`id=123,124,125` |
| `mode` | String | Primary sort mode for the results.  <br>Options:  `updated`,  `submitted`,  `metadata`  <br>Default:  `updated` | `mode=updated`<br>`mode=submitted`<br>`mode=metadata` |
| `type` | String | Secondary sort mode for the results.  <br>Options:  `views`,  `downloads`,  `rep` | `type=downloads` |
| `days` | Integer | Number of days to filter results based on file submission or update date. Defaults to `365`. If set to `-1`  the results query for all STEX files, irrespective of their date uploaded or updated. | `days=30` |
| `since` | String _OR_ Integer | Filters the results for files submitted **after** a certain point in time.  <br>Supports ISO date format or a Unix timestamp.  <br>(Handy conversion site [here](https://www.timestamp-converter.com/).) | `since=2024-04-01T08:26:25Z`  <br>`since=1711959985` |
| `to` | String _OR_ Integer | Filters the results for files submitted **up to** a certain point in time.  <br>Uses the same input format as the  `since`  parameter, and can be used on its own, or in combination as a date-to-date range. | `to=2025-02-08T21:47:47Z`  <br>`to=1739051267` |
| `datetype` | String | Controls the date timestamp format used.  <br>Options:  `iso`,  `unix`,  `pretty`  <br>Default:  `iso` | `datetype=iso`  <br>`datetype=unix`  <br>`datetype=pretty` |
| `sizetype` | String | Sets what file size format is used. The  `auto`  option decides which format is best for each file size.  <br>Options:  `auto`,  `megabytes`,  `kilobytes`,  `bytes`  <br>Default:  `auto` | `sizetype=auto`  <br>`sizetype=megabytes`  <br>`sizetype=kilobytes`  <br>`sizetype=bytes` |
| `desctype` | String | Adds the file description data in any of the specified formats.  <br>Allows more than one option when separated by commas.  <br>Options:  `text`,  `html`,  `urls`  <br>If  `urls`  is specified, it lists Source URLs and/or GitHub URLs in an 'infoURLs' field (if any are provided on a file). | `desctype=text,html,urls` |
| `filterurls` | String | Filters URLs when  `desctype=urls`  is used.  <br>Allows one or multiple comma-separated terms. | `filterurls=simtropolis.com` |
| `images` | String | Determines which images should be fetched. Each option assigns them to a separate array field.  <br>Options:  `primary`,  `main`,  `thumbs`,  `desc` | `images=primary,main,desc` |
| `category` | Integer | Specific category ID to filter files. Only files within this category specified will be returned. The SC4 category IDs range from  `101-122`.<br>101 = Residential<br>102 = Commercial<br>103 = Industrial<br>104 = Agricultural<br>105 = Building Sets<br>106 = Civic & Non-RCI<br>107 = Utilities<br>108 = Parks & Plazas<br>109 = Waterfront<br>110 = Transportation<br>111 = Automata<br>112 = Gameplay Mods<br>113 = Graphical Mods<br>114 = Cheats<br>115 = Tools<br>116 = Maps<br>117 = Ready Made Regions<br>118 = Dependencies<br>119 = 3ds Models<br>120 = Obsolete & Legacy<br>121 = Reference & Info<br>122 = DLL Mods<br><br><details><summary>CitiesXL</summary>003 = CitiesXL Buildings<br>010 = CitiesXL 3D Models<br>012 = CitiesXL Lots<br>013 = CitiesXL Maps<br>015 = CitiesXL Textures & Props<br>016 = CitiesXL Mods & Tools</details><details><summary>SimCity (2013)</summary>017 = SimCity (2013) Buildings<br>019 = SimCity (2013) Game Mods<br>020 = SimCity (2013) Programs & Tools<br>021 = SimCity (2013) Vehicles<br>022 = SimCity (2013) User Interface<br>023 = SimCity (2013) Roads & Traffic</details><details><summary>Cities: Skylines</summary>024 = Cities: Skylines Buildings<br>026 = Cities: Skylines Game Mods<br>027 = Cities: Skylines Roads & Traffic<br>029 = Cities: Skylines Programs & Tools<br>030 = Cities: Skylines Maps<br>024 = Cities: Skylines Props<br>038 = Cities: Skylines Vehicle Assets</details><details><summary>SimCity 2013</summary>041 = SimCity 3000 Files<br>042 = SimCity 3000 Maxis Files<br>043 = SimCity 3000 Cities & Maps</details><details><summary>Banished</summary>150 = Banished Mods</details><details><summary>Cities: Skylines II</summary>156 = Cities: Skylines II</details> | `category=101` |
| `author` | String _OR_ Integer | Filter files by author. Use the author's user ID for a numeric input, or their name as a string. No quotes are required, but can be optionally added. | `author=NAM Team`  <br>`author=131403` |
| `query` | String | Search term to filter files by name.  <br>Multi-word queries can be enclosed in quotes. | `query="DLL Plugin"` |
| `sc4only` | Boolean | Only fetch files inside the SC4 categories.  <br>Use `true` to enable this filter.  <br>Default:  `false` | `sc4only=true` |
| `changelog` | Boolean | Adds the changelog details if present. Is in either text or HTML format depending on the last ordered  `desctype`  option.  <br>Use  `true`  to enable. Default:  `false` | `changelog=true` |
| `metadata` | Boolean | Adds the file metadata info if present.  <br>Use  `true`  to enable. Default:  `false` | `metadata=true` |
| `extras` | Boolean | Adds 3 extra fields: views, downloads, reputation  <br>Note: Reputation is shown anyway if  `type=rep`  is set.  <br>Use `true` to enable.  <br>Default:  `false` | `extras=true` |
| `sort` | String | Sort order for results.  <br>Options:  `asc` for ascending and `desc` for descending (newest first).  <br>Default:  `desc` | `sort=desc`  <br>`sort=asc` |
| `offset` | Integer | Allows the results to be offset by a specified number of records.  <br>Useful to find results beyond the 1000 files limit. | `offset=123` |
| `limit` | Integer | Restricts the results output, by trimming the total.  <br>Is an optional parameter which can be 1 or greater.  <br>Note: Maximum value: 1000 | `limit=100` |

# Examples
Example queries are courtesy of Cyclone Boom. These can be run in the browser. 
### Example 1:
All DLL files updated over the past year, by Null 45 only.
```
community.simtropolis.com/stex/files-api.php?key=<key>&mode=update d&type=downloads&days=365&query=DLL&category=122&sc4only=true&author=Null 45&sort=desc
```

### Example 2:
Retrieve a specific file directly using its ID number.
```
community.simtropolis.com/stex/files-api.php?key=<key>&id=36188
```

### Example 3:
Search for files submitted in the past 90 days, sorted by most downloads, for SC4 files only.
```
community.simtropolis.com/stex/files-api.php?key=<key>&mode=submitted&type=downloads&days=90&sc4only=true&sort=desc
```

### Example 4:
Fetch all SC4 files updated in the last year (the default days) by STEX Custodian.
```
community.simtropolis.com/stex/files-api.php?key=<key>&mode=updated&sc4only=true&author=STEX Custodian&sort=desc
```

### Example 5:
Find all files by Cori, from all categories, sorted by oldest submitted first.
```
community.simtropolis.com/stex/files-api.php?key=<key>&mode=submitted&days=-1&author=737259&sort=asc
```

### Example 6:
Fetch all submitted "small shops" in the Commercial category (ID 102), sorted by newest uploaded.
```
community.simtropolis.com/stex/files-api.php?key=<key>&mode=submitted&days=-1&query="small shops"&category=102&sc4only=true&sort=desc
```

### Example 7:
All files in category ID 112 (Gameplay Mods), updated within the last 500 days, sorted by least views.
```
community.simtropolis.com/stex/files-api.php?key=<key>&mode=updated&type=views&days=500&category=112&sort=asc
```

### Example 8:
All New York SC4 maps uploaded in category ID 116 (Maps), sorted by most downloaded, limited to the top 3 only.
```
community.simtropolis.com/stex/files-api.php?key=<key>&mode=submitted&type=downloads&query="new york"&category=116&sc4only=true&days=-1&sort=desc&limit=3
```

### Example 9:
Sort by highest reputation count for files updated within the past 30 days.
```
community.simtropolis.com/stex/files-api.php?key=<key>&days=30&type=rep
```

### Example 10:
Filter by SC4 files uploaded between 2024 and 2025, with a 1000 results limit, sorted by oldest submissions first.
```
community.simtropolis.com/stex/files-api.php?key=<key>&mode=submitted&since=2024-01-01T00:00:00Z&to=2025-01-01T00:00:00Z&sc4only=true&sort=asc&limit=1000
```

### Example 11:
All files updated since 1st January 2024, with date format set to 'pretty', file size format set to 'megabytes', description types set to text, HTML, and URLs, with the links filtered to SC4Devotion only, images set to primary, main, and description (desc), with the changelog, metadata, and extra fields shown, sorted in ascending order, with a 500 results limit.
```
community.simtropolis.com/stex/files-api.php?key=<key>&since=2024-01-01T00:00:00Z&datetype=pretty&sizetype=megabytes&desctype=text,html,urls&filterurls=sc4devotion.com&images=primary,main,desc&changelog&metadata&extras&sort=asc&limit=500
```
