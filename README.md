# Simtropolis sc4pac channel

This repository contains the code for the [sc4pac](https://memo33.github.io/sc4pac/#/) metadata channel that automatically handles uploads to the STEX.
Highly experimental state.
Add https://sc4pac.simtropolis.com/ to your sc4pac channels to use it.
See also https://github.com/memo33/sc4pac/issues/49 for the initial idea and discussion.

Currently, the STEX is polled for new content once every hour, meaning if your plugin is compatible and has valid metadata (see below), it should appear within the hour on the channel.

## Goals

- Minimize the amount of work needed by the admins of Simtropolis.
- Automate the generation of yaml metadata as much as possible with as minimal friction as possible for content creators.
- Backfill the channel with as much existing content from the STEX as feasible. See [#99](https://github.com/sebamarynissen/simtropolis-channel/issues/99) for the progress.

## Roadmap

- [x] Implement a proof of concept
- [x] Use the STEX api instead of html scraping
- [x] Automatically keep track of when the Simtropolis api was last called and only request new files after that date ([#21](https://github.com/sebamarynissen/simtropolis-channel/pull/21))
- [x] Support custom metadata as part of the package (by means of a metadata.yaml file in one of the uploads)
- [x] Handle various Simtropolis error scenarios (down for maintenance, 520, ...) ([#35](https://github.com/sebamarynissen/simtropolis-channel/pull/35))
- [x] Setup an action that creates a PR instead of pushing to main
- [x] Make the metadata generation robust & fool proof
  - [x] Ensure incorrect metadata cannot be deployed
  - [x] Ensure creators cannot publish packages under a separate name, *unless* explicitly allowed in the `permissions.yaml` file. That way someone from a team can upload under the team name, but only if explicitly allowed.
  - [x] Automatically generate DLL checksums (see [#37](https://github.com/sebamarynissen/simtropolis-channel/pull/37) for the discussion about this feature)
- [x] Handle non-zip archives. We'll probably just ignore those for now and require a package to be a .zip folder if it wants to be compatible.
- [ ] Move the PR generating action to a separate repo to make it reusable for other exchanges
- [ ] Move repository ownership to a Simtropolis member/organization on GitHub
- [x] Make the channel available under a simtropolis.com url: [https://sc4pac.simtropolis.com/](https://sc4pac.simtropolis.com/sc4pac-channel-contents.json)
- [x] Setup an action that sends a DM on Simtropolis when the linting of a package metadata fails ([#101](https://github.com/sebamarynissen/simtropolis-channel/pull/101/))
- [ ] Setup an action that automatically creates a GitHub release the first of every month with an overview of all packages that have been added the last month. The releases can have the format `YYYY.mm` as version tags.

# How to make your plugins compatible

In order for a plugin to be installable by sc4pac, sc4pac needs certain information about it, such as the dependencies and variants, and where the package can actually be downloaded.
This is done by so called *metadata*, which contains the information needed for sc4pac in a structured format.
You can find the specification of the metadata format on the [sc4pac website](https://memo33.github.io/sc4pac/#/metadata).
Writing metadata by hand is however a tedious and time consuming process, and that's where this channel fits in: it will download your plugin from the STEX, and automatically generate the required metadata for it, so that you only need to write minimal metadata yourself.

However, by default, a plugin added to the STEX will *not* be automatically added.
To indicate that your plugin should be add to the channel, you have to add a `metadata.yaml` file in **one** of the .zip folders you are about to upload to the STEX.
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
Let's assume your plugin needs three dependencies: BSC Mega Props - CP Vol 01, BSC Textures Vol 02 and Girafe's Oaks.
In that case, your `metadata.yaml` file should look like this:

```yaml
dependencies:
  - bsc:mega-props-cp-vol01
  - bsc:textures-vol02
  - girafe:oaks
```
The rest of the metadata will be generated automatically.

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

> ![NOTE]
> By default, you can only publish a package under your own account name as group. If you'd like to upload packages under another group name as well, file a PR to add yourself to `permissions.yaml`, or contact [smf_16](https://community.simtropolis.com/profile/259789-smf_16/) on Simtropolis.

Note that you can only override *packages* in your `metadata.yaml` file.
*Assets* are handled automatically: every folder you upload to the STEX gets added as an asset to the metadata.

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

Variants are extremely common for plugins.
The best known variant is Maxisnite vs. Darknite, but plugins can sometimes also offer a RHD and LHD variant.

Because this is so common, it can be cumbersome to write the variant metadata all the time.
However, if you upload a plugin to the STEX and have it adhere to a few rules, then this can be handled automatically.
For example, if your plugin both has a Maxisnite and Darknite variant, then all you have to do is follow a naming convention when uploading them to the STEX:
-  Name of your plugin (MN).zip
-  Name of your plugin (DN).zip

Alternatively
- Name of your plugin (maxisnite).zip
- Name of your plugin (darknite).zip

will also work.
The channel then automatically detects that these are maxisnite and darknite variants of your plugin, and it will generate the following metadata:

```yaml
group: author
name: stex-title
info:
  ...

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

However, if further customization is needed, you will need to write the variant metadata yourself in `metadata.yaml`.

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

While currently not yet implemented, the idea is to send a notification on Simtropolis if your package could not be added in the future.
