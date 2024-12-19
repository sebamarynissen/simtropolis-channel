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
- [ ] Automatically keep track of when the Simtropolis api was last called and only request new files after that date
- [ ] Support custom metadata as part of the package (by means of a metadata.yaml file in one of the uploads)
- [ ] Handle various Simtropolis error scenarios (down for maintenance, 520, ...)
- [ ] Make the metadata generation robust & fool proof
  - [ ] Ensure incorrect metadata cannot be deployed
  - [ ] Ensure creators cannot publish packages under a separate name, *unless* explicitly allowed, for example in a yaml file in this repo. That way someone from a team can upload under the team name, but only if explicitly allowed.
  - [ ] Automatically generate DLL checksums
- [ ] Move repository ownership to a Simtropolis member/organization on GitHub
- [ ] Make the channel available under a simtropolis.com url, e.g. https://sc4pac.simtropolis.com
