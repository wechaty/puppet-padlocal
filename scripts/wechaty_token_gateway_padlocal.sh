
#
# Huan(202201) deprecated: use `wechaty gateway` instead
#

if [ -z "$1" ]; then
  >&2 echo -e "Missing argument.\nUsage: $0 <__padlocal_token__>"
  exit 1
fi

WECHATY_PUPPET_PADLOCAL_TOKEN=$1
WECHATY_PUPPET=wechaty-puppet-padlocal

# Set port for your puppet service: must be published accessible on the internet
WECHATY_PUPPET_SERVER_PORT=8788

docker pull wechaty/wechaty

docker run \
--rm \
-ti \
-e WECHATY_LOG \
-e WECHATY_PUPPET \
-e WECHATY_PUPPET_PADLOCAL_TOKEN \
-e WECHATY_PUPPET_SERVER_PORT \
-e WECHATY_TOKEN="$WECHATY_PUPPET_PADLOCAL_TOKEN" \
-p "$WECHATY_PUPPET_SERVER_PORT" \
wechaty/wechaty
