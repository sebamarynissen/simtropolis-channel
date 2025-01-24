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
- [ ] Setup an action that sends a DM on Simtropolis when the linting of a package metadata fails (to verify with ST admins, but should probably be possible by sendin a POST to the correct endpoint).
- [ ] Setup an action that automatically creates a GitHub release the first of every month with an overview of all packages that have been added the last month. The releases can have the format `YYYY.mm` as version tags.

# How to make your plugins compatible

By default, a plugin added to the STEX will not be added to this channel.
Your plugin needs to be *compatible*.
In order to do this, you have to add a `metadata.yaml` file in **one** of the .zip folders you are about to upload to the STEX.
It doesn't matter where you put this `metadata.yaml` file, but it is advised to put it at the root of your .zip folder.

If your plugin has no dependencies and no specific installation needs, you can leave the `metadata.yaml` file empty (see below), but it is *mandatory* to have it, otherwise it will not be added to the channel.

In order for a package to be installable with sc4pac, metadata about it must be written.
You can learn more about this [in the official sc4pac documentation](https://memo33.github.io/sc4pac/#/metadata).
However, in order to appear on the Simtropolis channel, it is not required to write the full metadata, as most of the metadata can be generated automatically from the STEX information.

For example, consider [Magasin Valois by Jasoncw](https://community.simtropolis.com/files/file/36465-magasin-valois/)

![image](https://github.com/user-attachments/assets/2487f4fc-d6ec-49a7-a6fc-d656865f862b)

By default, the channel will generate the following metadata for it:

```yaml
group: jasoncw
name: magasin-valois
version: "1.0.0"
subfolder: 300-commercial
info:
  summary: Magasin Valois
  description: |-
    Magasin Valois, the brand only the most fashionable high wealth sims wear.

    It is a corner lot for the Euro tileset.

    - 1x2 growable and ploppable CS§§§ lot.
    - MaxisNite and DarkNite versions included.
    - DarkNite requires the [Day and Nite Modd](https://community.simtropolis.com/files/file/23089-simfox-day-and-nite-modd/)
    - Requires [mipro Essentials - December 2015](https://community.simtropolis.com/files/file/29130-mipro-essentials/) or newer.
  author: Jasoncw
  website: https://community.simtropolis.com/files/file/36465-magasin-valois/
  images:
    - https://www.simtropolis.com/objects/screens/monthly_2024_09/66f4a2f03413f_MagasinValois00.jpg.e77d15efa6ab68a2660313ca1c00a1a4.jpg
    - https://www.simtropolis.com/objects/screens/monthly_2024_09/66f4a2fbcfeb2_MagasinValois01.jpg.8450c652a322d9263f5825a66bc2d5a8.jpg
variants:
  - variant: { nightmode: standard }
    assets:
      - assetId: jasoncw-magasin-valois-maxisnite
  - variant: { nightmode: dark }
    dependencies: [ "simfox:day-and-nite-mod" ]
    assets:
      - assetId: jasoncw-magasin-valois-darknite

---
assetId: jasoncw-magasin-valois-maxisnite
version: "1.0.0"
lastModified: "2024-09-25T23:56:22Z"
url: https://community.simtropolis.com/files/file/36465-magasin-valois/?do=download&r=203589

---
assetId: jasoncw-magasin-valois-darknite
version: "1.0.0"
lastModified: "2024-09-25T23:56:22Z"
url: https://community.simtropolis.com/files/file/36465-magasin-valois/?do=download&r=203590
```

This is why you can leave the `metadata.yaml` file in your .zip empty: if the generated metadata from the STEX upload is sufficient for your package, you don't have to write any metadata yourself!
Everything is handled automatically.

However, note that the upload above specifies Mipro Essentials - December 2015 as a dependency.
Dependencies are ***not*** parsed automatically from the STEX upload, so `metadata.yaml` for the upload above should look like
```yaml
dependencies:
  - mipro:essentials
```
in order to be fully compatible.
Also note that Maxisnite and Darknite variants can be handled automatically ([see below](#supporting-variants)).

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
