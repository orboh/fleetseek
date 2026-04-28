/**
 * seed-debug-examples.js
 *
 * Inserts 3 sample DebugExperience records into the `experiences` table.
 * These represent real-world G1 debugging scenarios for development/testing.
 *
 * Usage:
 *   node apps/api/scripts/seed-debug-examples.js
 *
 * Requirements:
 *   DATABASE_URL env var must be set (see .env.example)
 *   The `experiences` table must exist (run db:migrate first)
 */

'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Monotonically increasing fake ULIDs for deterministic seeding
const SEED_EXPERIENCES = [
  {
    id: 'exp_01HWDEBUG00000000000000001',
    type: 'debug_note',
    robot_id: 'rbt_01HWSEEDROBOT0000000000001',
    title: 'G1 arm oscillation during pick task',
    tags: ['g1', 'oscillation'],
    trust_score: 87,
    status: 'canonical',
    data: {
      symptoms: {
        observed_behavior: {
          text: 'Right arm oscillates with ~2 Hz frequency when holding an object at full extension. Oscillation amplitude increases with payload weight.',
        },
        error_messages: [],
        conditions: {
          task: 'pick_place',
          environment: 'lab',
        },
      },
      root_cause: {
        category: 'parameter_change',
        description: 'WBC PD controller Kd (derivative gain) was too high for the arm end-effector inertia at full extension. High Kd amplifies velocity noise from joint encoders, causing sustained oscillation.',
      },
      resolution: {
        type: 'parameter_change',
        human_required: false,
        changes: [
          {
            description: 'Reduce arm Kd gain in WBC parameter config',
            value: 'config/wbc_params.yaml: kd_arm: 0.8 -> 0.4',
          },
          {
            description: 'Optionally add low-pass filter on joint velocity feedback',
            value: 'config/wbc_params.yaml: joint_vel_lpf_cutoff_hz: 20.0  # [Hz]',
          },
        ],
      },
      failed_attempts: [
        {
          description: 'Reducing Kp (proportional gain) — did not stop oscillation, only reduced position accuracy',
        },
      ],
    },
    applicability: {
      robot_model: 'unitree_g1',
      task_context: 'pick_place with payload > 1 kg at arm full extension',
    },
    provenance: {
      source: 'manual',
      robot_id: 'rbt_01HWSEEDROBOT0000000000001',
    },
    trust_signals: {
      application_count: 12,
      success_count: 11,
      human_verified: true,
    },
  },

  {
    id: 'exp_01HWDEBUG00000000000000002',
    type: 'debug_note',
    robot_id: 'rbt_01HWSEEDROBOT0000000000001',
    title: 'Joint position limit error on left elbow',
    tags: ['g1', 'joint_error'],
    trust_score: 72,
    status: 'human_reviewed',
    data: {
      symptoms: {
        observed_behavior: {
          text: 'Left elbow (joint index 5) throws JOINT_POSITION_LIMIT_EXCEEDED error during shelf-stocking motion. Robot stops and enters safe-mode. Error appears only when arm is commanded past ~140 degrees flexion.',
        },
        error_messages: [
          'ERROR [WBC] Joint 5 position limit exceeded: cmd=2.51 rad, limit=2.44 rad',
          'SafeMode triggered: all joints locked',
        ],
        conditions: {
          task: 'shelf_stocking',
          environment: 'lab',
        },
      },
      root_cause: {
        category: 'parameter_change',
        description: 'Motion planner joint limit for left elbow was set to the hardware mechanical limit (2.51 rad) rather than the software safety margin (2.44 rad). A firmware update changed the default safety margin but the parameter file was not updated.',
      },
      resolution: {
        type: 'parameter_change',
        human_required: false,
        changes: [
          {
            description: 'Update left elbow joint limit in motion planner config to match firmware safety margin',
            value: 'config/joint_limits.yaml: left_elbow_max_rad: 2.44  # [rad] — firmware v1.3+ safety margin',
          },
        ],
      },
      failed_attempts: [
        {
          description: 'Restarting the controller — error persisted on next same motion',
        },
      ],
    },
    applicability: {
      robot_model: 'unitree_g1',
      task_context: 'any task requiring elbow flexion > 140 degrees, firmware v1.3+',
    },
    provenance: {
      source: 'manual',
      robot_id: 'rbt_01HWSEEDROBOT0000000000001',
    },
    trust_signals: {
      application_count: 7,
      success_count: 7,
      human_verified: true,
    },
  },

  {
    id: 'exp_01HWDEBUG00000000000000003',
    type: 'debug_note',
    robot_id: 'rbt_01HWSEEDROBOT0000000000001',
    title: 'Unitree SDK connection timeout after network change',
    tags: ['g1', 'sdk'],
    trust_score: 65,
    status: 'human_reviewed',
    data: {
      symptoms: {
        observed_behavior: {
          text: 'Python SDK throws ConnectionTimeoutError when calling any robot API. Robot power LED is on and heartbeat is visible on the robot\'s LCD. Problem started after switching development laptop to a different Wi-Fi network.',
        },
        error_messages: [
          'unitree_sdk2py.core.channel.ChannelFactory: connect timeout (5.0s)',
          'DDS participant creation failed: no matching network interface',
        ],
        conditions: {
          task: 'sdk_test',
          environment: 'lab',
        },
      },
      root_cause: {
        category: 'command_sequence',
        description: 'Unitree SDK2 uses DDS (Data Distribution Service) which binds to a specific network interface at startup. After the laptop switched Wi-Fi networks, the SDK was still bound to the old interface (or a virtual interface) that could not reach the robot at 192.168.123.164/24.',
      },
      resolution: {
        type: 'command_sequence',
        human_required: false,
        changes: [
          {
            description: 'Explicitly set ROBOT_NETWORK_INTERFACE env var before running SDK',
            value: 'export ROBOT_NETWORK_INTERFACE=<interface_name>  # find with: ip route get 192.168.123.164',
          },
          {
            description: 'Find correct interface bound to robot subnet',
            value: 'ip route get 192.168.123.164 | grep -oP "dev \\K\\S+"',
          },
          {
            description: 'Verify connectivity before launching SDK',
            value: 'ping -c 3 192.168.123.164  # G1 fixed IP',
          },
        ],
      },
      failed_attempts: [
        {
          description: 'Restarting the Python script without setting ROBOT_NETWORK_INTERFACE',
        },
        {
          description: 'Power cycling the robot — connection issue was on laptop side, not robot',
        },
      ],
    },
    applicability: {
      robot_model: 'unitree_g1',
      task_context: 'any SDK session after network interface change, multi-NIC dev laptops',
    },
    provenance: {
      source: 'manual',
      robot_id: 'rbt_01HWSEEDROBOT0000000000001',
    },
    trust_signals: {
      application_count: 5,
      success_count: 4,
      human_verified: false,
    },
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Connected to database.');
    console.log(`Seeding ${SEED_EXPERIENCES.length} DebugExperience records...`);

    await client.query('BEGIN');

    for (const exp of SEED_EXPERIENCES) {
      // Use INSERT ... ON CONFLICT DO NOTHING for idempotent re-runs
      await client.query(
        `INSERT INTO experiences (
          id, type, title, robot_id, tags, trust_score, status,
          data, applicability, provenance, trust_signals,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          NOW(), NOW()
        ) ON CONFLICT (id) DO NOTHING`,
        [
          exp.id,
          exp.type,
          exp.title,
          exp.robot_id,
          exp.tags,
          exp.trust_score,
          exp.status,
          JSON.stringify(exp.data),
          JSON.stringify(exp.applicability),
          JSON.stringify(exp.provenance),
          JSON.stringify(exp.trust_signals),
        ]
      );
      console.log(`  Inserted: ${exp.id} — "${exp.title}"`);
    }

    await client.query('COMMIT');
    console.log(`\nSeed complete. ${SEED_EXPERIENCES.length} records inserted (skipped if already exist).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed, rolled back:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
