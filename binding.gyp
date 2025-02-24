{
  "targets": [
    {
      "target_name": "telegram-file-server",
      "sources": [],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ],
      "dependencies": [
        "node_modules/telegram/binding.gyp:tdlib"
      ],
      "conditions": [
        ["OS==\"android\"", {
          "cflags": [
            "-fPIC",
            "-fno-exceptions"
          ],
          "cflags_cc": [
            "-fno-rtti",
            "-fno-exceptions",
            "-std=c++14"
          ],
          "ldflags": [
            "-static-libstdc++",
            "-static-libgcc"
          ]
        }]
      ]
    }
  ]
}