# Simtropolis sc4pac channel

This repository contains the code for the [sc4pac](https://memo33.github.io/sc4pac/#/) metadata channel that automatically handles uploads to the STEX.
Add https://sc4pac.simtropolis.com/ to your sc4pac channels to use it.
See also https://github.com/memo33/sc4pac/issues/49 for the initial idea and discussion.

In order for a plugin to be installable by sc4pac, sc4pac needs certain information about it, such as the dependencies and variants, and where the package can actually be downloaded.
This is done by so called *metadata*, which contains the information needed for sc4pac in a structured format.
You can find the specification of the metadata format on the [sc4pac website](https://memo33.github.io/sc4pac/#/metadata).
Writing metadata by hand can be a tedious and time consuming process, and that's where this channel fits in,  providing automation to automatically generate metadata from both new and existing STEX uploads.

Currently, the STEX is polled for new content once every hour, meaning if your plugin is compatible and has valid metadata, it should appear within the hour on the channel.

## Principles
- Minimize the amount of work needed by the admins of Simtropolis.
- Automate the generation of yaml metadata as much as possible with as minimal friction as possible for content creators.
- Backfill the channel with as much existing content from the STEX as feasible. See [#99](https://github.com/sebamarynissen/simtropolis-channel/issues/99) for the progress.

## Contributions
Contributions are welcome!
- If you are a mod author looking to add sc4pac-compatibility to one of your uploads, refer to the [How to make my plugins compatible](/docs/adding-via-stex.md) article.
- If you are looking to add sc4pac-compatibility to other's uploads, metadata may also be generated and validated in bulk using scripts in this repository. Refer to the [Adding metadata in bulk](/docs/adding-via-scripts.md) article. This is the recommended approach.
- Package metadata may also be written by hand. Refer to the [metadata format](https://memo33.github.io/sc4pac/#/metadata) documentation and the [Yaml Editor for sc4pac](https://yamleditorforsc4pac.net/).

Please also refer to the [best practices guide](/docs/metadata-best-practices.md).
