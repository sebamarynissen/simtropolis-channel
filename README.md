# Simtropolis sc4pac channel

This repository contains the code for the [sc4pac](https://memo33.github.io/sc4pac/#/) metadata channel that automatically handles uploads to the STEX.
Highly experimental state.
Add `https://sebamarynissen.github.io/simtropolis-channel/channel` to your sc4pac channels to use it.

Currently, content on the STEX is *not* processed automatically, but the goal is to automatically fetch the latest STEX uploads and process them.
Ideally this happens by Simtropolis triggering a workflow dispatch on this repo, but we could also run an action that checks for new updates every hour or so.

## Goals

- Minimize the amount of work needed by the admins of Simtropolis.
- Automate the generation of yaml metadata as much as possible which as minimal friction as possible for content creators.

See also https://github.com/memo33/sc4pac/issues/49 for the initial idea and discussion.

## Roadmap

- [x] Implement a proof of concept
- [ ] Use the STEX api instead of html scraping
- [ ] Automatically keep track of when the Simtropolis api was last called and only request new files after that date
- [ ] Handle various Simtropolis error scenarios (down for maintenance, 520, ...)
- [ ] Move repository ownership to a Simtropolis member/organization on GitHub
- [ ] Make the channel available under a simtropolis.com url, e.g. https://sc4pac.simtropolis.com
