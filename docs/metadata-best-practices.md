# Guidelines
This document summarizes guidelines and best practices for writing metadata. Most of the rules are handled by a linting process, and contributions here should not be merged until the linting test fully passes. The items detailed here are mainly not included in the linting, but instead are stylistic preferences to maintain a good user experience in sc4pac.

A few overall points:[^overall-points]
- Reflect the STEX upload 1:1 in terms of packages - don't worry about splitting it into multiple packages
- Clean up the package name where appropriate. Eliminate repetitive team/people/etc. names in the package name and add them to the author field. The assetId names can stay the same.
- Watch out for `-partX` assetId suffixes - this may be an indication that DN/MN variants are required

These rules serve the idea that a creator should be able to "take over" the metadata with minimal disruption. Minimize breaking up the structure of the package, perhaps except for resource packages, as it'll be ugly if a creator takes over the metadata and changes the structure entirely.


## Package `group`
- If the mod was uploaded as part of a modding group or team, tend towards the author's name for the group name as much as possible.[^remove-team-name]
    - Over the last 10 years or so, publishing under team names has become less common, as most of the teams disbanded. So if the content is clearly attributable to a single author who ideally is also the uploader, use the author name as group. For dependency packs, follow existing names to make it easy to identify and recognize the correct dependency pack.
    
    
    
## Package `name`
- Remove team and author names, and add them into the `info.authors` area.[^remove-authors-1][^remove-authors-2]
    - `name: ptt-hq-by-thailand-design-team` → `name: ptt-hq`
    - `name: thai-wah-tower-2-banyan-tree-bangkok-hotel-fix-by-thailand-design-team-and-glenni` → `name: thai-wah-tower-2-banyan-tree-bangkok-hotel`
    - `name: madhatter106s-surf-shacks-re-lotted-by-paeng` → `name: madhatter106s-surf-shacks-re-lotted`
    - `name: paeng-and-terring-amazed` → `name: amazed`, add paeng and Terring to the authors
    - `name: c88-ceafus-88-texture-pack` → `name: texture-pack`
    - Names like this will also be present in the `assetId`. It is fine to leave as-is as they are not user facing, though you may change them to match the package group and name if you wish
    - If you are uploading a significant number of packages and want to omit the team name from all of them, for example "NYBT" - which is recommended - then you can add the author to `permissions.yaml` and add `nybt` to the prefixes. This looks like:
    ```
    - id: 237489
    name: Vlasky
    prefixes:
        - nybt
    ```
    - In this case, any time `npm run add` is run, "NYBT" is automatically stripped from the package name.

- If the package has a *volume* number, prefer the `vol01` style.[^volume-style]
    - `name: signage-volume-1` → `name: signage-vol01`

- If the package name has a *version* like `-v1` or `-v2022`, generally omit it, unless multiple multiple versions of the same plugin coexist and should be installable simultaneously

- Some tweaking should be made to awkwardly hyphenated names.[^fix-awkward-hyphens]
    - `name: bbandt-bank` → `name: bb-and-t-bank` or `name: bbt-bank`. You could look at how the STEX URL handles this for ideas.
    - `name: taylor-house-r1and-cs1-and-lm` → `name: taylor-house-r1-and-cs1-and-lm`
    - `name: steinsas-tarnet-v-2022` → `name: steinsas-tarnet-v2022`

- Generally fix typos or misspelled words.[^fix-typos]

> [!NOTE]
> If you update the package name, you should also adjust the name of the YAML file to stay in sync.
> This isn't a hard requirement as the files are actually identified by the Simtropolis id (for example when an author pushes an update), but the filename is generated based on the name, so I tend to try to keep them in sync
> Using one of the examples presented above, rename `/23563-ptt-hq-by-thailand-design-team.yaml` → `/23563-ptt-hq.yaml`


## Package `dependencies`
- If you encounter dependencies not tracked and resolved automatically, add them to `scripts/<exchange_name>.js`.[^untracked-deps]
- If a package requires models or props or textures from another (non-dependency) package, prefer creating a **resource** package containing the necessary items. This avoid requiring users to install lots they may not necessarily want. See [peg:lakeside-resort](https://github.com/sebamarynissen/simtropolis-channel/blob/main/src/yaml/peg/11423-lakeside-resort.yaml) for an example. This means the dependency should change from `peg:lakeside-resort` to `peg:lakeside-resort-props`.[^use-resource-package]
    - Depending on the contents of this package, you could call it `-props`, `-models`, `-textures`, or `-resource`, though `-resource` is generally preferred, especially if this package contains a combination of those things.
- The submenus-dll should **_not_** be listed as a dependency, except in the case of exemplar patching. Files that use this do not **require** the submenus-dll - instead, they are **compatible** with the submenus-dll. The files will work just fine without submenus-dll installed.[^submenus-dll-not-a-dep]


## Package `summary`
- Remove author and team names, as these are readily apparent with the package group.[^remove-name-from-summary]
    - `summary: Frex_Ceafus Hummer Pack` → `summary: Hummer Pack`
    - `summary: SBT-Assateague Lighthouse` → `summary: Assateague Lighthouse`


## Package `description`
- Minimal changes to the description is required. Obvious spelling or grammatical issues should be fixed, clearly broken links could be fixed.
- If the STEX description contains an HTML table, convert the table to markdown.[^description-updates]


## Darknite/Maxisnite variants
- Some mods may be darknite-only. As [explained in the sc4pac documentation](https://memo33.github.io/sc4pac/#/metadata?id=variants), in this case variants should still be added, and it will look like this:
``` yaml
assets:
  - assetId: kellydale2003-bay-adelaide-centre-west
variants:
  - variant: { nightmode: standard }
  - variant: { nightmode: dark }
    dependencies: [ "simfox:day-and-nite-mod" ]
```
- Normally the script does this automatically if the asset is labeled as `(DN)` or `(Darknite)`, but sometimes this does not work properly. This may need to be fixed manually.[^dn-only-models]
- If an author creates two separate uploads, one each for Maxisnite and one for Darknite, these should be merged into a single package with a DN/MN variant. This is an exception for the 1:1 package to upload rule.[^merging-mn-dn-uploads]. Have the script generate files for both, then merged them manually:
    - Move the DN asset to the MN file
    - Rename the MN file to remove the MN identifier
    - Replace the website field with websites and add the DN url.
    - Update the DN asset id in the variants section, and if needed create a variant section yourself if the script did not pick it up as a MN/DN package (which depends on whether the asset was labeled with MN or not).
    - Remove the DN file entirely.


## Assets
- Watch out for `-part0`, `-part1` etc. appended to the end of the asset id. These are added if there are multiple assets and the script can't figure out what they're used for, like Maxisnite/Darknite, or for a option specific to the upload. Remove the `-part` suffixes and rename according to their purpose.[^asset-part]
- If you update the package name, the asset name does not necessarily also need to be renamed. There's logic in place that prevents accidental renaming of a package (by changing the STEX title), which might break packages that depend on it, but assets usually aren't shared across packages (especially not on the STEX channel, so naming there is less important).[^asset-rename]


# General contribution tips
- Break large PRs up into smaller parts - there's no need to included all of an author's content in a single PR if there are dozens of items. Smaller PRs are easier to test on your end, and easier to review by the package maintainers.
- If you encounter any issues adding a package to where it doesn't work in-game, or it's not quite ready due to a dependency not yet added to sc4pac, create the metadata, but leave it commented out. It can always be uncommented later when the requisite items have been added.[^commenting-out]



[^overall-points]: https://github.com/sebamarynissen/simtropolis-channel/pull/177#issuecomment-2661581078
[^remove-team-name]: https://github.com/sebamarynissen/simtropolis-channel/pull/112
[^remove-authors-1]: https://github.com/sebamarynissen/simtropolis-channel/pull/177
[^remove-authors-2]: https://github.com/sebamarynissen/simtropolis-channel/pull/191
[^volume-style]: https://github.com/sebamarynissen/simtropolis-channel/pull/142
[^fix-awkward-hyphens]: https://github.com/sebamarynissen/simtropolis-channel/pull/199
[^fix-typos]: https://github.com/sebamarynissen/simtropolis-channel/pull/190
[^untracked-deps]: https://github.com/sebamarynissen/simtropolis-channel/pull/138
[^use-resource-package]: https://github.com/sebamarynissen/simtropolis-channel/pull/323
[^submenus-dll-not-a-dep]: https://github.com/memo33/sc4pac/pull/97#issuecomment-2973599756
[^remove-name-from-summary]: https://github.com/sebamarynissen/simtropolis-channel/pull/199
[^description-updates]: https://github.com/sebamarynissen/simtropolis-channel/pull/248
[^dn-only-models]: https://github.com/sebamarynissen/simtropolis-channel/pull/121
[^merging-mn-dn-uploads]: https://github.com/sebamarynissen/simtropolis-channel/pull/181
[^asset-part]: https://github.com/sebamarynissen/simtropolis-channel/pull/138
[^asset-rename]: https://github.com/sebamarynissen/simtropolis-channel/pull/142
[^commenting-out]: https://github.com/sebamarynissen/simtropolis-channel/pull/116
