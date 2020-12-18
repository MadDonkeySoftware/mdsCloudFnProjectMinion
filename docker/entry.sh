#!/bin/sh

fn update context api-url http://192.168.5.90:8080 > /dev/null 2>&1;
fn update context registry 192.168.5.90:5000/frito > /dev/null 2>&1;

"$@"