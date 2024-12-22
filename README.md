# Simtropolis sc4pac channel

This repository contains the code for the [sc4pac](https://memo33.github.io/sc4pac/#/) metadata channel that automatically handles uploads to the STEX.
Highly experimental state.
Add `https://sebamarynissen.github.io/simtropolis-channel/channel` to your sc4pac channels to use it.

Currently, content on the STEX is *not* processed automatically, but the goal is to automatically fetch the latest STEX uploads and process them.
Ideally this happens by Simtropolis triggering a workflow dispatch on this repo, but we could also run an action that checks for new updates every hour or so.

See also https://github.com/memo33/sc4pac/issues/49 for the initial idea and discussion.

## Goals

- Minimize the amount of work needed by the admins of Simtropolis.
- Automate the generation of yaml metadata as much as possible with as minimal friction as possible for content creators.

## Roadmap

- [x] Implement a proof of concept
- [x] Use the STEX api instead of html scraping
- [x] Automatically keep track of when the Simtropolis api was last called and only request new files after that date ([#12](https://github.com/sebamarynissen/simtropolis-channel/pull/21))
- [x] Support custom metadata as part of the package (by means of a metadata.yaml file in one of the uploads)
- [ ] Handle various Simtropolis error scenarios (down for maintenance, 520, ...)
- [x] Setup an action that creates a PR instead of pushing to main
- [ ] Make the metadata generation robust & fool proof
  - [x] Ensure incorrect metadata cannot be deployed
  - [x] Ensure creators cannot publish packages under a separate name, *unless* explicitly allowed, for example in a yaml file in this repo. That way someone from a team can upload under the team name, but only if explicitly allowed.
  - [ ] Automatically generate DLL checksums
- [ ] Handle non-zip archives. We'll probably just ignore those for now and require a package to be a .zip folder if it wants to be compatible.
- [ ] Move the PR generating action to a separate repo to make it reusable for other exchanges
- [ ] Move repository ownership to a Simtropolis member/organization on GitHub
- [ ] Make the channel available under a simtropolis.com url, e.g. https://sc4pac.simtropolis.com
- [ ] Setup an action that sends a DM on Simtropolis when the linting of a package metadata fails (to verify with ST admins, but should probably be possible by sendin a POST to the correct endpoint).
- [ ] Setup an action that automatically creates a GitHub release the first of every month with an overview of all packages that have been added the last month. The releases can have the format `YYYY.mm` as version tags.

# How to make your plugins compatible

By default, a plugin added to the STEX will not be added to this channel.
Your plugin needs to be *compatible*.
In order to do this, you have to add a `metadata.yaml` file **at the root** of one of the .zip folders you are about to upload to the STEX.
You don't have to add this to every .zip folder, the channel will pick up the first `metadata.yaml` file it finds in the uploaded assets.

If your plugin has no dependencies and no specific installation needs, you can leave the `metadata.yaml` file empty (see below), but it is *mandatory* to have it, otherwise it will not be added to the channel.

In order for a package to be installable with sc4pac, metadata about it must be written.
You can learn more about this [in the official sc4pac documentation](https://memo33.github.io/sc4pac/#/metadata).
However, in order to appear on the Simtropolis channel, it is not required to write the full metadata, as most of the metadata can be generated automatically from the STEX information.
More specifically, by default this channel transforms a STEX upload into the following metadata:

```yaml
group: stex-author
name: stex-title
version: stex-version
subfolder: stex-category
info:
  summary: STEX Title
  description: |-
    Description as given on the STEX, transformed from html to markdown
  author: STEX Author
  website: https://community.simtropolis.com/files/file/[id]-stex-author-stex-title
  images:
    - https://community.simtropolis.com/path-to-image.jpg
assets:
  - assetId: stex-author-stex-title

---
assetId: stex-author-stex-title
url: https://community.simtropolis.com/files/file/[id]-stex-author-stex-title?do=download&r=[id]
lastModified: Last updated date from STEX
version: stex-version
```

This is why you can leave the `metadata.yaml` file in your .zip empty: if the generated metadata from the STEX upload is sufficient for your package, you don't have to write any metadata yourself!
Everything is handled automatically.

If your plugin has dependencies, or other specific installation needs for which you need to be able to customize the metadata, you can do this with the `metadata.yaml` file.
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

If your plugin has very specific needs - for example because it provides a maxisnite and darknite variant *in the same .zip* folder - then you can reference your assets in the `metadata.yaml` as follows:

```yaml
assets:
  - assetId: ${{ assets.0.assetId }}
    exclude:
      - .SC4Model$

variants:
  - variant: { nightmode: standard }
    assets:
      - assetId: ${{ assets.0.assetId }}
        include:
          - maxisnite.SC4Model$
  - variant: { nightmode: dark }
    dependencies: [ "simfox:day-and-nite-mod" ]
    assets:
      - assetId: ${{ assets.0.assetId }}
        include:
          - darknite.SC4Model$
```

Note that there is actually a better approach for providing support for both maxisnite and darknite by uploading two .zips (see below).

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
