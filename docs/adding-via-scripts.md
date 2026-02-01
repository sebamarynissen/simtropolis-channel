# Adding metadata in bulk

The STEX houses tens of thousands of uploads from over two decades of modding, and adding each file one at a time by hand is a practically insurmountable task. For that reason, this repository includes scripts designed to assist in the bulk creation and validation of metadata.
This process **will** require some familiarity with the command line.
Note that the instructions and specific commands may vary slightly between Windows and MacOS/Linux users; most of the instructions here are outlined from a Windows user's perspective.

## Overview
This repository contains the following scripts, some of which add new features on top of the default sc4pac CLI commands:
- `npm run add` - Generate metadata from a STEX URL
- `npm run build` - Rebuild the Simtropolis sc4pac channel to include the new metadata
- `npm run prune` - Scan each lot to find dependencies not listed in the metadata.
- `npm run list` - Generate a list of dependencies from a package in a standard format.
- `npm run symlink` - 
- `npm run sc4pac` - Have sc4pac install packages

## Dependencies
The following dependencies are required to run these scripts:
1. [Node.js](https://nodejs.org). Node.js is an environment that allows you to run javascript code outside of a web browser. It may be installed from the official site, however, for ease of installation and upgrading versions, I recommend using a Node.js version manager.
    - For Windows use [nvm-windows](https://github.com/coreybutler/nvm-windows)
    - For Mac and Linux use [nvm](https://github.com/nvm-sh/nvm) directly
2. [NPM](https://docs.npmjs.com/about-npm)
3. [SC4 CLI Tool](https://github.com/sebamarynissen/sc4)
4. [sc4pac CLI](https://memo33.github.io/sc4pac/#/cli)

## Setting up your environment
Clone the repo.
Run `npm install` once to install all of the dependencies for the scripts


Note that in order for everything to work, you need a `.env` file in the root of the repo that contains the following values:
``` ini
STEX_API_KEY=<your_api_key>
SC4PAC_SIMTROPOLIS_TOKEN=<your_stex_token>
SC4_PLUGINS="C:\Users\<user>\Documents\SimCity 4\Plugins"

# The path to your SimCity 4 installation folder, meaning the folder with SimCity_1.dat
SC4_INSTALLATION="C:\GOG Games\SimCity 4 Deluxe Edition"

# The cache root should be the same as what you use with sc4pac
SC4PAC_CACHE_ROOT="C:\Users\<user>\AppData\Local\io.github.memo33\sc4pac\cache"
```

The STEX API key is required to parse the information from an upload.
To request a STEX API key, contact an admin.
The sc4pac token is required to authenticate the download to your STEX profile, bypassing the download limit enforced for guest users.
Your sc4pac token can be generated [here](https://community.simtropolis.com/sc4pac/my-token/).

You will also need to have the `sc4pac` binary available in your `Path` Environment Variable.

The .env file also allows you to specify standard dependencies and variants as a comma-separated list ([#109](https://github.com/sebamarynissen/simtropolis-channel/pull/109)). You would otherwise need to specify these items every time `npm run sc4pac` is run.

``` ini
STANDARD_DEPENDENCIES=memo:submenus-dll,lowkee33:appalachian-terrain-mod-complete
STANDARD_VARIANTS=nightmode=dark,driveside=right,sfbt:essentials:tree-family=Maxis-deciduous-trees
```



## `npm run add`
This script ([#77](https://github.com/sebamarynissen/simtropolis-channel/pull/77)) is used to generate metadata for packages that don't include a metadata.yaml file.
It includes automated dependency tracking based on the links mentioned in the description.

You may supply one STEX URL, or multiple STEX URLs separated by a space. It is encouraged to add multiple urls as much as possible so that the package index doesn't need to be rebuilt for every package.
``` sh
npm run add <url>
npm run add <url> <url> <url>
```

Note that even though dependencies are tracked automatically, you still need to verify that everything is correct. 
Most importantly, packages that link to the BSC legacy pack will get the entire bsc dependencies collection listed as their dependency, which is not desirable.
The same holds for Girafe's flora and other legacy packs.
To automatically prune only the required dependencies, see `npm run prune`.

### Splitting packages
[#82](https://github.com/sebamarynissen/simtropolis-channel/pull/82) adds the functionality to automatically split packages in a resource and main package.
This can be useful for relots, or when creating props that are also available as MMPs, for example.

To use it, run
``` sh
npm run add -- <url> <url> --split
```

It works by inspecting every file in the asset and then separating lots and flora from props, textures and models, but in a more intelligent way. It will parse every file in the asset, and then add labels to each file, according to the following rules:

- `.SC4Lot` files get the `lot` label
- `.SC4Model` files get the `model` label
- `.SC4Desc` and .dat files are parsed, and labels are added based on every entry in it:
  - If the file contains a prop exemplar, the `prop` label is added
  - If the file contains a flora exemplar, the `flora` label is added
  - If the file contains a `building` exemplar, the building label is added, but only if it's a growable building. If it's a ploppable building, then the `lot` label is added. That's to ensure that growable building exemplars end up in the resource package, which allows them to be relotted with the existing building exemplar. Ploppable building exemplars can't be used for re-lotting (if I understand correctly), so that's why they get the `lot` label
  - If the DBPF contains an S3D file, the `model` label is added
  - If the DBPF contains an FSH file, the `texture` label is added

Subsequently the files get put in either the resource or main package based on the labels.
This means that it separates lots and buildings, but also handles the case of flora being provided as props as well.
This separation happens based on label "priority".
Any asset that has a `lot` or `flora` label gets put in the main package, all the rest in the resource package. See an example output [here](https://github.com/sebamarynissen/simtropolis-channel/pull/83/changes#diff-7060101106e894d381714a8252bb9de93917ceccd79e5fd2bc5e14a0e471a4e6)

### Darknite only
[#122](https://github.com/sebamarynissen/simtropolis-channel/pull/122) adds a `--darknite-only` flag so that every asset is forcibly tagged as darknite, so that the correct variants get generated.
This is useful in case an author uploaded a plugin as darknite-only, but did not label the asset as such.
``` sh
npm run add -- https://community.simtropolis.com/files/file/30475-bay-adelaide-centre-west/ --darknite-only
```

It is possible to use when adding multiple files, but it will apply to all - it cannot be used on a per file basis.
``` sh
npm run add -- <url> <url> --darknite-only
```

Note the `--` *before* the url. This is needed because otherwise the `--darknite-only` flag is passed as flag to npm instead of the script itself. The `--` means "pass all flags after this to the script".

### Adding (and updating) by author
It is additionally possible to add *all* files from a specific author at once ([#296](https://github.com/sebamarynissen/simtropolis-channel/pull/296)).
One or multiple different authors may be specified at once.
By default, content already in the channel may is skipped, but specifying the `-u` or `--update` argument will  reprocess those files to pick up any STEX updates that may have happened since the metadata was created.
``` sh
npm run add:author -- memo
npm run add:author -- memo "NAM Team"
npm run add:author -- 95442  # using author id
npm run add:author -- memo -u  # update existing files
```

By default this command also outputs a confirmation dialog summarizing what will be processed. This may be skipped with the `-y` or `--yes` arguments.

![image](https://github.com/user-attachments/assets/beeb6c26-6251-4914-8696-65133083f9a6)


## `npm run prune`
This command ([#78](https://github.com/sebamarynissen/simtropolis-channel/pull/78)) automatically reports the dependencies for a package.
Some authors unfortunately report inaccurate dependencies, and this script will warn about missing dependencies that are not already included in the metadata.
The command may be run on it's own, or specific packages may be targeted for pruning using glob patterns.
``` sh
npm run prune
npm run prune mattb325:*
```

### Updating metadata
By default, pruning only outputs a tabular report to the CLI. the `--force` argument ([#87](https://github.com/sebamarynissen/simtropolis-channel/pull/87)) modifies the generated metadata by adding packages to the dependencies list, if they are known.
``` sh
npm run prune -- --force
npm run prune -- mattb325:* diego-del-lano:432-park-avenue --force
```
Note that it is advised to only do this after committing the initially generated metadata so that it's easy to see what the pruning has changed.



## npm run list
The list command ([#93](https://github.com/sebamarynissen/simtropolis-channel/pull/93)) generates a list of dependencies in standardized format. 
It will generate an `.html` file in `dist/copy.html` which shows the dependency list as an html `<ul>` list. Click "Copy" to copy it to the clipboard.

When pasting it inside a wysiwyg editor - such as the description edit box on the STEX, or in an e-mail client - it will paste it as an actual html list. If pasting inside something that only supports text - such as text editors - it will paste the list in sc4pac format.

Example usage:
``` sh
npm run list mattb325:ikea-superstore
```

Which generates the following html:

Dependencies:
- [bsc:mega-props-cp-vol02](https://www.sc4evermore.com/index.php/downloads/download/3-sc4d-lex-legacy-bsc-common-dependencies-pack)
- [bsc:mega-props-sg-vol01](https://www.sc4evermore.com/index.php/downloads/download/3-sc4d-lex-legacy-bsc-common-dependencies-pack)
- [supershk:mega-parking-textures](https://community.simtropolis.com/files/file/31006-supershk-mega-parking-textures/)

Dark nite only:
- [simfox:day-and-nite-mod](https://community.simtropolis.com/files/file/23089-simfox-day-and-nite-modd/)

and the following generated text:
```
- bsc:mega-props-cp-vol02
- bsc:mega-props-sg-vol01
- simfox:day-and-nite-mod
- supershk:mega-parking-textures
```

Multiple packages, as well as glob patterns may also be included in the same HTML document ([#98](https://github.com/sebamarynissen/simtropolis-channel/pull/98))
``` sh
npm run list mattb325:ikea-superstore parisian:*
```

You may additionally specify a `--default-only` flag.
If this flag is used, only packages that are present on the default channel will get their dependency link rendered as `group:name`.
If the package is not in the default channel, then the link is still rendered, but the visible text is just the author and summary of the package.

Example usage with `--default-only` (note: the `--` is needed to pass the `--default-only` option down to the script, otherwise Node interprets it as an npm option).
``` sh
npm run list -- simmer2:5g-* mattb325:ikea* --default-only
```
An example result file for the command `npm run list -- simmer2:5g-* mattb325:ikea*` can be found here: [result.zip](https://github.com/user-attachments/files/18521437/result.zip)

![image](https://github.com/user-attachments/assets/b375dd4a-db3d-49dc-9eaf-6453df32ca15)






# An Example Workflow
The following example illustrates what the various commands do and how they are supposed to be used. 

Imagine you want to add metadata for [Ceafus 88's Dollar General](https://community.simtropolis.com/files/file/35441-dollar-general/). Start by running:
``` sh
npm run add https://community.simtropolis.com/files/file/35441-dollar-general/
```
This will generate the following metadata:

<details>

<summary>Metadata</summary>

``` yaml
group: ceafus-88
name: dollar-general
version: "1.0.0"
subfolder: 300-commercial
info:
  summary: Dollar General
  description: |-
    Good evening Simtropolis,

    They appear everywhere, so why not in SimCity4? Get to getting some deals!

    3x3 and 2x5 growable CS§ lots

    Simply download and extract the .zip into your Plugins folder!

    There are 2 variants available, a short and a long. I would like to thank [@RRetail](https://community.simtropolis.com/profile/744613-rretail/) for the wonderful lotting he did for me! Give him a follow and support his work, he's one of many doing a good thing for the SC4 community!

    Dependencies:

    -   [R](https://community.simtropolis.com/files/file/32781-rr-mega-prop-pack-vol-1/)[R MEGA Prop Pack Vol. 1](https://community.simtropolis.com/files/file/32781-rr-mega-prop-pack-vol-1/)
    -   [RR MEGA Prop Pack Vol. 2.](https://community.simtropolis.com/files/file/32473-rr-mega-prop-pack-vol-2/)[1](https://community.simtropolis.com/files/file/32473-rr-mega-prop-pack-vol-2/)
    -   [RR MEGA Prop Pack Vol. 3.1.2](https://community.simtropolis.com/files/file/34747-rr-mega-prop-pack-vol-3/)
    -   [Mu](https://community.simtropolis.com/files/file/30773-hd-north-american-53ft-semi-trailers-vol1/)[shy's Trailers](https://community.simtropolis.com/files/file/30773-hd-north-american-53ft-semi-trailers-vol1/)
    -   [SHK Parking Pack](https://community.simtropolis.com/files/file/27563-shk-parking-pack/)
    -   [SuperSHK MEGA Parking Textures 1.0.1](https://community.simtropolis.com/files/file/31006-supershk-mega-parking-textures/)
    -   [SuperSHK + FA3 Parking Textures](https://community.simtropolis.com/files/file/31423-supershk-fa3-parking-textures/)
    -   BSC \- VIP Girafe Trees/Shrubs
        -   [Elm Trees](https://sc4devotion.com/csxlex/lex_filedesc.php?lotGET=3347)
        -   [Feather Grass](https://sc4devotion.com/csxlex/lex_filedesc.php?lotGET=3001)
        -   [Linden Trees](https://sc4devotion.com/csxlex/lex_filedesc.php?lotGET=2869)
        -   [Poplar Trees](https://sc4devotion.com/csxlex/lex_filedesc.php?lotGET=3579)
        -   [Rowan Trees](https://sc4devotion.com/csxlex/lex_filedesc.php?lotGET=3244)

    Thank you so much for the love and support over the years SC4 community, it has meant the world!
  author: Ceafus 88
  website: https://community.simtropolis.com/files/file/35441-dollar-general/
  images:
    - https://www.simtropolis.com/objects/screens/monthly_2023_01/63d1f4b3288ce_NewCity-Jan.17031674703755.png.d02a5ccc88950c69a78feac988205f44.png
    - https://www.simtropolis.com/objects/screens/monthly_2023_01/63d1f4b66c2bd_NewCity-Oct.13011674701868.png.f5c156b7683ae495eac49adafc2be8e4.png
    - https://www.simtropolis.com/objects/screens/monthly_2023_01/63d1fc6aa46e4_NewCity-Aug.20021674704357.png.dac0f8390e4eab6eeb5c39d25da0e3bc.png
    - https://www.simtropolis.com/objects/screens/monthly_2023_01/63d1fc934e2c0_NewCity-Feb.13031674619499.png.69b4fa39faab885dc8652c38f61d49ec.png
    - https://www.simtropolis.com/objects/screens/monthly_2023_01/59a66aa5c66c9_DollarGeneral6.jpg.322f5c26897351d0f489c05b04364d29.jpg.977ccfc342ca6993e1ea8ee2bb58b7a4.jpg
    - https://www.simtropolis.com/objects/screens/monthly_2023_01/DG1.png.23905c9442810af3126f85df9500c889.png
    - https://www.simtropolis.com/objects/screens/monthly_2023_01/DG2.png.5068f1694a36c310f8771c4ca65e668e.png
    - https://www.simtropolis.com/objects/screens/monthly_2023_01/image.png.aeab3ca5e7caad25f79d6c44412ac090.png.b21f8c34e234453227220c70f4cf6c1d.png
dependencies:
  - girafe:elms
  - girafe:feather-grass
  - girafe:lindens
  - girafe:poplars
  - girafe:rowan-trees
  - mushymushy:na-53ft-trailers-vol1
  - rretail:mega-prop-pack-vol1
  - rretail:mega-prop-pack-vol2
  - rretail:mega-prop-pack-vol3
  - shk:parking-pack
  - supershk:fa3-parking-textures
  - supershk:mega-parking-textures
assets:
  - assetId: ceafus-88-dollar-general

---
assetId: ceafus-88-dollar-general
version: "1.0.0"
lastModified: "2023-01-26T04:08:33Z"
url: https://community.simtropolis.com/files/file/35441-dollar-general/?do=download&r=196375
```

</details>

Note how the dependencies have been parsed automatically from the links specified in the description. Next you should verify that the channel is built correctly by running
``` sh
npm run build
```

A typical error that can happen is that a subfolder could not be determined automatically from the STEX, in which case the build will fail, telling you there's a missing key. You can solve this by adding a subfolder yourself.

Once the channel is built, you should ensure that everything is installed correctly. For this you can run
``` sh
npm run sc4pac ceafus-88:*
```
This will run sc4pac and install everything in the `/dist/plugins/` folder. 
This folder hence represents what a user's plugins folder should look like when installing nothing but the specified packages.
Note that it is required to specify what packages you would like to install. We could've specified the full package name `ceafus-88:dollar-general`, but you can also use a glob pattern, such as `ceafus-88:*`, which would install all of Ceafus-88's packages. You can even use multiple globs if you want:
``` sh
npm run sc4pac ceafus-88:* mattb325:*
```
The only requirement is that the packages need to be in the *local* channel, because that's what the glob patterns are matched against.

If sc4pac has successfully installed the package, you should test the package in the game. The recommended approach for this is to symlink the `/dist/plugins/` folder in your `/Documents/Simcity 4/` folder. This can be done by running
``` sh
npm run symlink
```
This only needs to be done once. Make sure to rename your existing plugins folder to something else, otherwise the symlink won't be created as the folder already exists.

Now you can fire up the game and test the lots. For convenience, the extra cheats DLL is always installed, so you can also use `LotPlop` and `BuildingPlop`. If you have added a large collection of a certain creator, then you can also use the [sc4 cli tool](https://github.com/sebamarynissen/sc4) to easily plop all lots from a package. Note you can use the same glob patterns as before here.
``` sh
sc4 city plop "Region/City - test city.sc4" ceafus-88:*
```

This plops every lot in a neat grid.

![sXzAyZxO7f](https://github.com/user-attachments/assets/9ad131e9-6a01-4859-afde-84712c59cd3f)

Be aware that querying or bulldozing certain lots, especially ones with budget sliders may result in a CTD.
This is unavoidable due to how the buildings are plopped.
As such, use this to ensure all the lots visually appear correct, and that there are no brown boxes or missing props or textures.


Now, you may notice that unfortunately some creators make mistakes when listing their dependencies. This is where the prune command comes in. Run it as
``` sh
npm run prune
```
and it will automatically report all dependencies for each package.
As an example, for the `ceafus-88:dollar-general` package:
```
Installation folder: C:\GOG Games\SimCity 4 Deluxe Edition
Plugins folder: C:\Users\sebam\Documents\SimCity 4 modding\simtropolis-channel\dist\plugins
sc4pac dependencies:
  - girafe:elms
  - girafe:feather-grass
  - girafe:lindens
  - girafe:poplars
  - girafe:rowan-trees
  - rretail:mega-prop-pack-vol1
  - shk:parking-pack
  - supershk:fa3-parking-textures
  - supershk:mega-parking-textures
Other dependencies:
The following dependencies were not found:
┌─────────┬────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────┬────────────┐
│ (index) │ kind   │ file                                                                                                 │ instance   │
├─────────┼────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────┼────────────┤
│ 0       │ 'Prop' │ ...\300-commercial\ceafus-88.dollar-general.1.0.0.sc4pac\C88_3x3_DollarGeneralGROW_3_b0ddc53d.SC4Lot │ 0x62c2953a │
│ 1       │ 'Prop' │ ...ns\300-commercial\ceafus-88.dollar-general.1.0.0.sc4pac\C88_2x5_DollarGeneralGROW_907543fb.SC4Lot │ 0x62c2953a │
│ 2       │ 'Prop' │ ...ns\300-commercial\ceafus-88.dollar-general.1.0.0.sc4pac\C88_2x5_DollarGeneralGROW_907543fb.SC4Lot │ 0x17690e9e │
└─────────┴────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────┴────────────┘
```
First of all, we can notice that compared to the original list of dependencies, the following dependencies are no longer listed (they have been pruned):
```
  - mushymushy:na-53ft-trailers-vol1
  - rretail:mega-prop-pack-vol2
  - rretail:mega-prop-pack-vol3
```


We can also see that the package contains a few missing dependencies. Entering the instance numbers into [@noah-severyn's PropTextureCatalog](https://sc4proptexturecatalog.azurewebsites.net) gives use two results:
- [MM North American 40ft Semi Trailers Vol.1](https://sc4proptexturecatalog.azurewebsites.net/?itemcontains=0x62c2953a&size=32)
- [nos.17 essentials v13](https://sc4proptexturecatalog.azurewebsites.net/?itemcontains=0x17690e9e&size=32)

So, it looks like the creator has mistakenly listed Mushy's [53ft trailers](https://community.simtropolis.com/files/file/30773-hd-north-american-53ft-semi-trailers-vol1/), whereas it should've been Mushy's [40ft trailers](https://community.simtropolis.com/files/file/30733-hd-north-american-40ft-semi-trailers-vol1/), and they also forgot [nos17:essentials](https://community.simtropolis.com/files/file/30114-nos17-essentials/).
You can verify in the game that this is indeed what happens. Notice the missing trailer in the left lot - which was plopped with the 53ft trailers as dependency.

![Missing dependency on the right](https://github.com/user-attachments/assets/c6751395-51ba-4f79-94ce-e00ed5ecf8f3)

This means that the *actual* list of dependencies is
```yaml
dependencies:
  - girafe:elms
  - girafe:feather-grass
  - girafe:lindens
  - girafe:poplars
  - girafe:rowan-trees
  - mushymushy:na-40ft-trailers-vol1
  - nos17:essentials
  - rretail:mega-prop-pack-vol1
  - shk:parking-pack
  - supershk:fa3-parking-textures
  - supershk:mega-parking-textures
```

Let's update the list of dependencies in the generated metadata and then run
``` sh
npm run build
npm run sc4pac ceafus-88:*
npm run prune
```
again. This time, no missing dependencies are reported:

```
Installation folder: C:\GOG Games\SimCity 4 Deluxe Edition
Plugins folder: C:\Users\sebam\Documents\SimCity 4 modding\simtropolis-channel\dist\plugins
sc4pac dependencies:
  - girafe:elms
  - girafe:feather-grass
  - girafe:lindens
  - girafe:poplars
  - girafe:rowan-trees
  - mushymushy:na-40ft-trailers-vol1
  - nos17:essentials
  - rretail:mega-prop-pack-vol1
  - shk:parking-pack
  - supershk:fa3-parking-textures
  - supershk:mega-parking-textures
Other dependencies:
```

Cool, the package metadata is now ready to be committed and a PR can be created from it.
Realistically, you would probably not do the pruning package by package, but just add a bunch of metadata at once with `npm run add <url> <url>`, and then only `npm run sc4pac` and `npm run prune` for all packages.

Also note that if a package links to the BSC common dependencies legacy pack, *all* bsc dependencies will get listed as a dependency. You can use `npm run prune` for this to fix that.