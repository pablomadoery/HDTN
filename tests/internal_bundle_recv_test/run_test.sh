#!/bin/bash
TEST_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
# Assuming standard structure: HDTN/tests/internal_bundle_gen_test/run_test.sh
HDTN_ROOT=$(dirname $(dirname $TEST_DIR))
BUILD_DIR=$HDTN_ROOT/build

# Cleanup
pkill -9 hdtn-one-process
pkill -9 bpsink-async
sleep 2

# 2. Start HDTN Node 1 (This will be the receiving node, acting as Node 2)
echo "Starting HDTN Node 10..."
$BUILD_DIR/module/hdtn_one_process/hdtn-one-process     --hdtn-config-file=$TEST_DIR/node10_config.json     --contact-plan-file=$TEST_DIR/contact_plan.json     > $TEST_DIR/hdtn.log 2>&1 &
HDTN_PID=$!
HDTN_LOG="$TEST_DIR/hdtn.log"

sleep 5 # Give HDTN time to start up

# 1. Start External Bundle Generator (bpgen-async)
echo "Starting bpgen-async..."
BPGEN_LOG="$TEST_DIR/bpgen.log"
$BUILD_DIR/common/bpcodec/apps/bpgen-async \
    --outducts-config-file="$TEST_DIR/bpgen_outducts.json" \
    --bundle-rate=1 \
    --dest-uri-eid=ipn:10.0 \
    --my-uri-eid=ipn:1.1 \
    --duration=5 \
    --bundle-size=1024 \
    --use-bp-version-7 \
    > "$BPGEN_LOG" 2>&1 &

BPGEN_PID=$!
echo "bpgen-async started with PID $BPGEN_PID"

# Wait for bpgen to finish (duration=5s) and for HDTN to process
sleep 10
kill $BPGEN_PID 2>/dev/null 

# 5. Stop processes
kill $HDTN_PID
wait $HDTN_PID 2>/dev/null

# Check HDTN Log for reception
echo "Checking HDTN log for bundle reception..."
if grep -q "TEST_VERIFICATION: HDTN Received Bundle" "$HDTN_LOG"; then
    echo "TEST PASSED: Bundle received by HDTN from external source"
    exit 0
else
    echo "TEST FAILED: Bundle NOT received by HDTN"
    echo "--- HDTN Log Tail ---"
    tail -n 20 "$HDTN_LOG"
    echo "--- BPGen Log Tail ---"
    tail -n 20 "$BPGEN_LOG"
    exit 1
fi
