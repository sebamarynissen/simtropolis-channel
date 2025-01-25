# Simtropolis sc4pac channel

This repository contains the code for the [sc4pac](https://memo33.github.io/sc4pac/#/) metadata channel that automatically handles uploads to the STEX.
Add https://sc4pac.simtropolis.com/ to your sc4pac channels to use it.
See also https://github.com/memo33/sc4pac/issues/49 for the initial idea and discussion.

Currently, the STEX is polled for new content once every hour, meaning if your plugin is compatible and has valid metadata (see below), it should appear within the hour on the channel.

## Principles

- Minimize the amount of work needed by the admins of Simtropolis.
- Automate the generation of yaml metadata as much as possible with as minimal friction as possible for content creators.
- Backfill the channel with as much existing content from the STEX as feasible. See [#99](https://github.com/sebamarynissen/simtropolis-channel/issues/99) for the progress.

# How to make your plugins compatible

In order for a plugin to be installable by sc4pac, sc4pac needs certain information about it, such as the dependencies and variants, and where the package can actually be downloaded.
This is done by so called *metadata*, which contains the information needed for sc4pac in a structured format.
You can find the specification of the metadata format on the [sc4pac website](https://memo33.github.io/sc4pac/#/metadata).
Writing metadata by hand is however a tedious and time consuming process, and that's where this channel fits in: it will download your plugin from the STEX, and automatically generate the required metadata for it, so that you only need to write minimal metadata yourself.

However, by default, a plugin added to the STEX will *not* be automatically added.
To indicate that your plugin should be added to the channel, you have to add a `metadata.yaml` file in **one** of the .zip folders you are about to upload to the STEX.
It doesn't matter where you put this `metadata.yaml` file, but it is advised to put it at the root of your .zip folder.

> [!NOTE]
> Currently, only plugins uploaded as .zip are supported, but support for .7z and .rar is planned.

If your plugin has no dependencies and no specific installation needs, you can leave the `metadata.yaml` file empty, but it is *mandatory* to have it, otherwise your plugin will not be added to the channel.
For example, consider [mattb325's Inmark Tower](https://community.simtropolis.com/files/file/35168-inmark-tower/).

![image](https://github.com/user-attachments/assets/a2b9874a-2063-4b0e-b34a-033148c59501)

If one of the uploaded .zip folders contains an empty `metadata.yaml` file, then the channel will generate the following metadata for it:

```yaml
group: mattb325
name: inmark-tower
version: "1.0.0"
subfolder: 200-residential
info:
  summary: Inmark Tower
  description: |-
    **Inmark Tower, by Mattb325.  
    \---------------------------------------**

    Though fictional, this design for a 36 floor apartment complex suitable for inner-city areas draws heavy inspiration from an apartment tower in Sydney's CBD.

    [...]
  author: mattb325
  website: https://community.simtropolis.com/files/file/35168-inmark-tower/
  images:
    - https://www.simtropolis.com/objects/screens/monthly_2022_04/Inmark.jpg.82cd6852f34cdeddb61569e8e7e68ed3.jpg
    - https://www.simtropolis.com/objects/screens/monthly_2022_04/Inmark1.jpg.c6bea92e2babc0324b03bafab43e39dd.jpg
    - https://www.simtropolis.com/objects/screens/monthly_2022_04/Inmark2.jpg.44f11dbd146ee646b9f52dcb807bab35.jpg
    - https://www.simtropolis.com/objects/screens/monthly_2022_04/Inmark3.jpg.ff4cbee0cab3c01e817a4953d9de4e93.jpg
    - https://www.simtropolis.com/objects/screens/monthly_2022_04/Inmark4.jpg.fba5793e0a7c79c45ebf64568dd957bb.jpg
    - https://www.simtropolis.com/objects/screens/monthly_2022_04/Inmark5.jpg.dc2a3a286bc5b1b1cb203a9c8d1edcbd.jpg
variants:
  - variant: { nightmode: standard }
    assets:
      - assetId: mattb325-inmark-tower-maxisnite
  - variant: { nightmode: dark }
    dependencies: [ "simfox:day-and-nite-mod" ]
    assets:
      - assetId: mattb325-inmark-tower-darknite

---
assetId: mattb325-inmark-tower-darknite
version: "1.0.0"
lastModified: "2022-04-30T22:01:01Z"
url: https://community.simtropolis.com/files/file/35168-inmark-tower/?do=download&r=194019

---
assetId: mattb325-inmark-tower-maxisnite
version: "1.0.0"
lastModified: "2022-04-30T22:01:01Z"
url: https://community.simtropolis.com/files/file/35168-inmark-tower/?do=download&r=194020

```

This is why you can leave the `metadata.yaml` file in your .zip empty: if the generated metadata from the STEX upload is sufficient for your package, you don't have to write any metadata yourself!
Everything is handled automatically.
Note how even maxisnite & darknite variants are handled automatically too - [see below](#supporting-variants) for an explanation on how this works.

However, if your plugin has dependencies, you will need to specify them in your `metadata.yaml` file.
The channel **does not** track them automatically, even if you have listed them in the description!
Let's assume your plugin needs three dependencies: **BSC Mega Props - CP Vol 01**, **BSC Textures Vol 02** and **Girafe's Oaks**.
In that case, your `metadata.yaml` file should look like this:

```yaml
dependencies:
  - bsc:mega-props-cp-vol01
  - bsc:textures-vol02
  - girafe:oaks
```
The rest of the metadata will be generated automatically.

Dependencies must be valid sc4pac identifiers that are available either in the [default channel](https://memo33.github.io/sc4pac/channel) or the [Simtropolis channel](https://sc4pac.simtropolis.com).
If a dependency is not available in either of those channels, you have to file a PR to add it to the [default channel](https://github.com/memo33/sc4pac) before you can use it, or you have to instruct users that this dependency must be installed by hand.
Work is being done to making as many dependencies available as possible, but especially for relots that use models of the original file, it's possible that you won't be able to specify the dependency in sc4pac format.

> [!NOTE]
> If you find it difficult to list the dependencies for your plugin in sc4pac format, have a look at the [sc4 cli tool](https://community.simtropolis.com/forums/topic/763559-tracking-dependencies-in-the-age-of-sc4pac/), which has an action specifically designed for listing the dependencies in sc4pac format.

If your plugin has other specific installation needs for which you need to be able to customize the metadata, it should also be done within `metadata.yaml`.
The channel will use anything it finds in here, and fill in the gaps based on the STEX upload.

For example, if you want to upload a package under a different group name - for example because you're part of the NYBT team - and it needs the `nybt:essentials` as a dependency, then this can be done by adding
```yaml
group: nybt
dependencies:
  - nybt:essentials
```
to the `metadata.yaml` file.
That's all there is to it!
The channel will automatically fill in the rest of the gaps, such as the package name, summary, description, assets, ...

> [!IMPORTANT]
> By default, you can only publish a package under your own account name as group. If you'd like to upload packages under another group name as well, file a PR to add yourself to `permissions.yaml`, or contact [smf_16](https://community.simtropolis.com/profile/259789-smf_16/) on Simtropolis.

If your plugin has very specific needs - for example if you want to split up your package in both a *models & props* part, and *lots* part, which is useful if you expect other people to create re-lots - then you can reference your assets in the `metadata.yaml` as follows:

```yaml
name: my-package-models
assets:
  - assetId: ${{ assets.0.assetId }}
    include:
      - \.SC4Model$
      - \.SC4Desc$
      - \.dat$

---
name: my-package
assets:
  - assetId: ${{ assets.0.assetId }}
    include:
      - \.SC4Lot$
```

This interpolation technique does not only work for the assets.
You can actually reference any of the automatically generated metadata like that.
For example,

```yaml
info:
  description: |-
    This is a description for ${{ package.group }}:${{ package.name }} that overrides the STEX description.
    This package is called ${{ package.info.summary }} on the STEX and has the following assets:
    -  ${{ assets.0.url }}
    -  ${{ assets.1.url }}
```

## Supporting variants

It's quite common for plugins to come in variants.
The best known variant is Maxisnite vs. Darknite, but plugins can sometimes also offer a RHD and LHD variant or a specific CAM variant.

However, manually writing metadata for variants is cumbersome and prone to errors.
To solve this, the channel can automatically generate metadata for variants if you follow a certain convention in your uploads.
There are 4 supported variants:

- [Maxisnite/darknite](#maxisnitedarknite)
- [CAM/No CAM](#camno-cam)
- [RHD/LHD](#rhdlhd)
- [Resolution (HD or SD)](#hdsd)

### Maxisnite/darknite

The channel detects a Maxisnite or Darknite variant of your plugin by looking at the **file name** of the upload.
An asset is tagged as the Maxisnite variant if it either has `(MN)` or `(Maxisnite)` in its name, and likewise as Darknite variant if it either has `(DN)` or `(Darknite)` in its name.

For example, if your upload contains two files
- Name of your plugin (MN).zip
- Name of your plugin (Darknite).zip

then it will generate the following metadata:
```yaml
variants:
  - variant: { nightmode: standard }
    assets:
      - assetId: author-stex-title-maxisnite
  - variant: { nightmode: dark }
    dependencies: [ "simfox:day-and-nite-mod" ]
    assets:
      - assetId: author-stex-title-darknite

---
assetId: author-stex-title-maxisnite
url: https://community.simtropolis.com/...
version: 1.0.0
lastModified: ...

---
assetId: author-stex-title-darknitenite
url: https://community.simtropolis.com/...
version: 1.0.0
lastModified: ...
```

Note that this means that both folders need to contain the entire contents of the plugin - which is the usual convention.
Alternatively, you can also put shared resources - such as the `.SC4Lot` files - in a separate .zip, and only put the models in `(MN)` and `(DN)` labeled .zips.
For example,
- Plugin (lots).zip
- Plugin (models) (MN).zip
- Plugin (models) (DN).zip

will generate 

```yaml
variants:
  - variant: { nightmode: standard }
    assets:
      - assetId: author-stex-title
      - assetId: author-stex-title-maxisnite
  - variant: { nightmode: dark }
    dependencies: [ "simfox:day-and-nite-mod" ]
    assets:
      - assetId: author-stex-title
      - assetId: author-stex-title-darknite
```

Some older uploads also have the Maxisnite and Darknite models in the same .zip folder, where the user then has to manually remove the folder they don't need.
While it is strongly discouraged, this approach is supported on the channel too.
For example, consider the following folder structure of your .zip:

```
metadata.yaml
lot.SC4Desc
building.SC4Desc
Model files (KEEP ONLY ONE)/
  Maxisnite/
    model.SC4Model
  Darknite/
    model.SC4Model
```
which will generate

```yaml
variants:
  - variant: { nightmode: standard }
    assets:
      - assetId: author-stex-title
        exclude:
          - /Darknite/
  - variant: { nightmode: dark }
    dependencies: [ ""simfox:day-and-nite-mod" ]
    assets:
      - assetId: author-stex-title
        exclude:
          - /Darknite/
```

> [!IMPORTANT]
> You don't need to add `simfox:day-and-nite-mod` to your list of dependencies.
> This is handled automatically.
> If you do include `simfox:day-and-nite-mod` to your dependency list, the verification process of the metadata will report an error, and your package will not be added.

### CAM/No CAM

Another thing you commonly encounter in plugins is that they provide separate growable lots for players using the CAM.
The channel can automatically generate the required variants for this too.
Similar to DN/MN variants, an upload is tagged as CAM if it contains either `(CAM)`, `(CAMeLot)` or `(CAMeLots)` in its name.
However, in contrast to DN/MN, the CAM upload must only contain the `.SC4Lot` and `.SC4Desc` files of the *growable* lots.
The channel will subsequently inspect all files of the main asset, and exclude them in the CAM variant.

For example, consider you have the following structure of your uploads:

```
Plugin.zip/
  metadata.yaml
  model.SC4Model
  ploppable.SC4Lot
  ploppable.SC4Desc
  R$$_8.SC4Lot
  R$$_8.SC4Desc

Plugin (CAMeLots).zip/
  R$$_10.SC4Lot
  R$$_10.SC4Desc
```

Then the channel will generate the following metadata:

```yaml
variants:
  - variant: { CAM: "no" }
    assets:
      - assetId: group-name
  - variant: { CAM: "yes" }
    assets:
      - assetId: group-name
        exclude:
          - /R\$\$_8\.SC4Lot$
          - /R\$\$_8\.SC4Desc$
      - assetId: group-name-cam
```

Note that the ploppable is *not* excluded from the main asset in the CAM variant, only the growables are, so the CAM asset must only contain the growable files.
This is based on a convention that [Jasoncw](https://community.simtropolis.com/profile/85340-jasoncw/content/?type=downloads_file) uses in his uploads.

Note that it's also possible to combine MN/DN variants with CAM variants.
In order for this to work, all you have to do is create separate MN and DN zips, and combine it with a separate zip for the CAM, sticking to the same principles that the MN/DN folders need to contain the entire plugin, but the CAM should only hold the growables.
This is again based on a convention used by Jasoncw.

So, in the example above, this means that your folder structure should become

```
Plugin (MN).zip/
  metadata.yaml
  model.SC4Model
  ploppable.SC4Lot
  ploppable.SC4Desc
  R$$_8.SC4Lot
  R$$_8.SC4Desc

Plugin (DN).zip/
  model.SC4Model
  ploppable.SC4Lot
  ploppable.SC4Desc
  R$$_8.SC4Lot
  R$$_8.SC4Desc

Plugin (CAMeLots).zip/
  R$$_10.SC4Lot
  R$$_10.SC4Desc
```

which will generate the required variant metadata automatically:

```yaml
variants:
  - variant: { nightmode: "standard", CAM: "no" }
    assets:
      - assetId: group-name-maxisnite
  - variant: { nightmode: "standard", CAM: "yes" }
    assets:
      - assetId: group-name-maxisnite
        exclude:
          - /R\$\$_8\.SC4Lot$
          - /R\$\$_8\.SC4Desc$
      - assetId: group-name-cam
  - variant: { nightmode: "dark", CAM: "no" }
    assets:
      - assetId: group-name-darknite
  - variant: { nightmode: "dark", CAM: "yes" }
    assets:
      - assetId: group-name-darknite
        exclude:
          - /R\$\$_8\.SC4Lot$
          - /R\$\$_8\.SC4Desc$
      - assetId: group-name-cam
```

### RHD/LHD

Driveside variants work similar to nightmode variants.
An asset is tagged as RHD if it has `(RHD)` in its name, and as LHD if it has `(LHD)` in its name.
Just like with nightmode variants, both .zips need to contain the entire contents of the plugins, but you can specify shared assets in a shared asset if you like.

Example:

```
Plugin (RHD).zip/
  metadata.yaml
  model.SC4Model
  lot.SC4Lot

Plugin (LHD).zip/
  model.SC4Model
  lot.SC4Lot
```

which generates

```yaml
variants:
  - variant: { driveside: right }
    assets:
      - assetId: group-name-rhd
variants:
  - variant: { driveside: left }
    assets:
      - assetId: group-name-left
```

### HD/SD

Some plugins provide both an SD and HD variant of the models, which the channel can handle automatically as well.
There are two ways to do this.
The first one is to explicitly label the assets with `(HD)` and `(SD)`, in which case it works similar to MN/DN variants.

For example,
```
Plugin.zip/
  metadata.yaml
  lot.SC4Lot

Plugin (models) (HD).zip/
  model.SC4Model

Plugin (models) (SD).zip/
  model.SC4Model
```
generates
```yaml
variants:
  - variant: { group:name:resolution: sd }
    assets:
      - assetId: group-name
      - assetId: group-name-sd
  - variant: { group:name:resolution: hd }
    assets:
      - assetId: group-name
      - assetId: group-name-hd
```

Alternatively, you can also label only the HD, asset, in which case all `.SC4Model` files from the main asset become excluded:

For example
```
Plugin.zip/
  metadata.yaml
  lot.SC4Lot
  model.SC4Model

Plugin (models) (HD).zip/
  model.SC4Model
```
generates
```yaml
variants:
  - variant: { group:name:resolution: sd }
    assets:
      - assetId: group-name
  - variant: { group:name:resolution: hd }
    assets:
      - assetId: group-name
        exclude:
          - \.SC4Model$
      - assetId: group-name-hd
```

### Custom variants

If your package contains custom variants - for example such as choosing a texture variant - then you will have to write the variant metadata yourself using the interpolation technique as shown above.
Note that this is either all or nothing: as soon as the channel sees that you have defined `variants` yourself, it will no longer perform any automatic generation of the builtin variants such as the nightmode.

However, as you can derive from above, the most common cases are covered, so as long as you stick to the conventions as explained, you will need to write minimal metadata to handle variants.

## Subfolders

Most of the time, you don't want your plugin to end up in the root of a user's plugins folder unless your plugin is a DLL.
Sc4pac [allows you to specify what subfolder a plugin will end up in](https://memo33.github.io/sc4pac/#/metadata?id=subfolder).
While it is strongly recommended to explicitly specify the subfolder you want your plugin to end up in - which can be done by specifying a `metadata.yaml` file
```yaml
subfolder: 660-parks
```
it is still possible to leave this out and have the channel decide the subfolder for you based on the *File Descriptor* of the STEX upload.

![image](https://github.com/user-attachments/assets/b1e0cb8a-90fc-4e6a-83c2-cb200dfe5ad2)

Mapping the file descriptor to a subfolder happens according to the following table.
Note that a descriptor is always *normalized* first before checking it against the table, meaning that it is lowercased, and spaces become hyphens.
```yaml
dependency: 100-props-textures
residential: 200-residential
commercial: 300-commercial
industrial: 400-industrial
agricultural: 410-agriculture
utilities-water: 500-utilities
utilities-power: 500-utilities
utilities-garbage: 500-utilities
services-police: 610-safety
services-fire: 610-safety
services-education: 620-education
services-medical: 630-health
civics-landmarks: 360-landmark
civics-rewards: 360-landmark
civics-parks: 660-parks
civics: 600-civics
services: 600-civics
automata: 710-automata
transport: 700-transit
mmp(s): 180-flora
mod: 150-mods
misc: 150-mods
```

If a file has multiple descriptors - for example both `Mod` and `Residential`, then the result will be `200-residential` because it has a higher priority in the map.

It also takes into account that descriptors might have longer names. For example, `Residential - Re-lot` does not exist in the table, but if this is the file descriptor, this is reduced to `Residential` automatically. Some examples:

- `Civics`, `Civics - Parks and Recreation` ⇒ `660-parks`
- `Civics`, `Civics - A very specific category of civics` ⇒ `600-civics`
- `Residential Re-lot` ⇒ `200-residential`
- `Mod`, `Utilities - Water` ⇒ `500-utilities`

As there isn't a clear one-on-one relation from Simtropolis file descriptors to sc4pac subfolders, it is **strongly recommended** to always provide the subfolder manually in your `metadata.yaml` file.
This is especially important if your plugin has specific needs, such as needing to be loaded after certain other plugins, meaning it should end up in `900-overrides`.

## DLL plugins

DLL mods are powerful, but they also come with a certain risk.
Given that they contain executable code, an attacker could replace a dll with a malicious one and infect users with it possibly going unnoticed for some time.

In order to mitigate this risk, DLL uploads have some special requirements.
The `metadata.yaml` for a dll plugin **must** specify an external url, and this url **must** be a GitHub url.
On top of that, you must also link your account on Simtropolis with your GitHub username in both `permissions.yaml` and `lint-config.yaml`.
Hence, if you want to start developing DLL plugins, you should create a PR which adds the required data to those files.

The `metadata.yaml` for a dll upload could look like this:
```yaml
url: https://github.com/user/repo/releases/download/v1.0/my-dll-mod.zip
```

If you also need control over the metadata for the *package*, you have to make sure the `url` is not included on the package metadata, as it is information about an *asset*, not a package:

```yaml
name: my-dll-mod
info:
  description: |-
    This is a custom description of the DLL mod, only visible to sc4pac users.

---
url: https://github.com/user/repo/releases/download/v1.0/my-dll-mod.zip
```

This approach ensures that if your Simtropolis account gets hacked, the hacker has no way to replace the asset downloaded by sc4pac with a malicious one, as it would require the hacker to also have access to your GitHub account *at the same time*.
As GitHub accounts are often protected with MFA nowadays, this makes it way less likely that a hacker succeeds in hacking both your Simtropolis and GitHub accounts at the same time.

Note that this does not offer any protection for users that download the dll directly from Simtropolis: if your account gets hacked and the hacker replaces your DLL with a malicious one, users can download the malicious DLL without any problems.
The defense layer developed here is only relevant to sc4pac users!
Hence, if you develop DLL plugins, it is advised to make the users aware of this and suggest them to use sc4pac to be safe.

For more information on this feature, you can refer to the implementation details in [#37](https://github.com/sebamarynissen/simtropolis-channel/pull/37).

## Invalid metadata

If you have added an invalid `metadata.yaml` file - which also includes referencing non-existent dependencies or assets - then your package will not be added to the channel.
Instead, a [pull request](https://github.com/sebamarynissen/simtropolis-channel/pulls) will be created with the package name you were trying to update, which will contain information about what was wrong with the package.
Hence it is always a good idea after uploading a plugin to check the [pull requests](https://github.com/sebamarynissen/simtropolis-channel/pulls) to see if your package was added successfully.
